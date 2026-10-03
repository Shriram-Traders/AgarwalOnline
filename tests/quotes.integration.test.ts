import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, Product, ProductVariant, User } from "../src/lib/db/models";
import { Sequence, SystemSetting } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { istDate } from "../src/lib/commerce/delivery";
import { saveTaxProfile } from "../src/lib/tax/profile";
import { QuoteBasket, QuoteRequest, School, SchoolMember } from "../src/lib/schools/models";
import { addRepresentative, createSchool, setSchoolActive } from "../src/lib/schools/members";
import { istDatePlus } from "../src/lib/schools/quote-math";
import type { Sheet } from "../src/lib/schools/quote-form";
import {
  addToQuote,
  closeQuoteRequest,
  quotationForViewer,
  quoteBasketView,
  respondToQuotation,
  saveQuoteDraft,
  sendQuotation,
  setQuoteLine,
  submitQuoteRequest,
} from "../src/lib/schools/quotes";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("School quote baskets and quotations", () => {
  let owner: string, admin: string, repA: string, repA2: string, repB: string, outsider: string;
  let schoolA: string, schoolB: string;
  const v: Record<string, string> = {};
  const p: Record<string, string> = {};

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, Sequence, SystemSetting, AuditLog, Notification]) await model.init();
    for (const model of [School, SchoolMember, QuoteBasket, QuoteRequest]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    const user = async (name: string, phone: string, roles: string[], email?: string) =>
      String((await User.create({ name, phone, roles, ...(email ? { email } : {}) }))._id);
    owner = await user("Owner", "9000000101", ["customer", "super-admin"]);
    admin = await user("Staff", "9000000102", ["customer", "admin"]);
    repA = await user("Asha", "9000000103", ["customer"], "asha@vidya.example");
    repA2 = await user("Ravi", "9000000104", ["customer"], "9000000104@phone.ags.invalid");
    repB = await user("Other rep", "9000000105", ["customer"], "rep@other.example");
    outsider = await user("Shopper", "9000000106", ["customer"]);
    await saveTaxProfile(owner, {
      legalName: "Agarwal General Stores",
      gstin: "27AAPFU0939F1ZV",
      address: "Main Road, Nagothane",
      stateCode: "27",
      terms: "Payment within 15 days of delivery.",
    });
    schoolA = (await createSchool(owner, { name: "Vidya Mandir", stateCode: "27" })).id;
    schoolB = (await createSchool(owner, { name: "Other School", stateCode: "29" })).id;
    await addRepresentative(owner, { schoolId: schoolA, userId: repA });
    await addRepresentative(owner, { schoolId: schoolA, userId: repA2 });
    await addRepresentative(owner, { schoolId: schoolB, userId: repB });
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const make = async (slug: string, product: Record<string, unknown>, variant: Record<string, unknown>) => {
      const created = await Product.create({
        slug,
        name: { en: slug, mr: slug },
        description: { en: slug, mr: slug },
        categoryId: category._id,
        categorySlug: "paper",
        status: "published",
        ...product,
      });
      const pack = await ProductVariant.create({
        productId: created._id,
        sku: slug.toUpperCase(),
        label: "Pack",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 11800,
        mrpPaise: 12000,
        ...variant,
      });
      p[slug] = String(created._id);
      v[slug] = String(pack._id);
    };
    await make("register", { showToCustomers: false, showToSchools: true, gstRatePercent: 18, hsnCode: "4820" }, { schoolPricePaise: 4250 });
    await make("chalk", { showToSchools: true, gstRatePercent: 5 }, {});
    await make("shop-pen", {}, {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const ask = async (lines: [string, number][] = [["register", 500], ["chalk", 40]]) => {
    for (const [slug, quantity] of lines) await addToQuote(repA, { schoolId: schoolA, variantId: v[slug], quantity });
    const { rev } = await quoteBasketView(schoolA);
    return submitQuoteRequest(repA, { schoolId: schoolA, rev, note: "Deliver to the office", neededBy: "" });
  };
  const sheet = (lines: Sheet["lines"], extra: Partial<Sheet> = {}): Sheet => ({
    lines,
    discount: { type: "none" },
    validUntil: istDatePlus(15),
    ...extra,
  });

  it("shares one basket per school, kept apart from every other school", async () => {
    await addToQuote(repA, { schoolId: schoolA, variantId: v.register, quantity: 500 });
    await addToQuote(repA2, { schoolId: schoolA, variantId: v.register, quantity: 100 });
    await addToQuote(repA2, { schoolId: schoolA, variantId: v.chalk, quantity: "40" });
    const basket = await quoteBasketView(schoolA);
    expect(basket.lines.map((line) => [line.name, line.quantity, line.addedBy, line.schoolPricePaise])).toEqual([
      ["register", 600, "Asha", 4250],
      ["chalk", 40, "Ravi", undefined],
    ]);
    expect(basket.rev).toBe(3);
    expect((await quoteBasketView(schoolB)).lines).toEqual([]);

    await expect(addToQuote(repA, { schoolId: schoolA, variantId: v["shop-pen"], quantity: 1 })).rejects.toThrow(
      "isn’t in the school catalogue",
    );
    await expect(addToQuote(repB, { schoolId: schoolA, variantId: v.register, quantity: 1 })).rejects.toThrow("SCHOOL_UNAVAILABLE");
    await expect(addToQuote(outsider, { schoolId: schoolA, variantId: v.register, quantity: 1 })).rejects.toThrow(
      "SCHOOL_UNAVAILABLE",
    );
    await expect(addToQuote(repA, { schoolId: schoolA, variantId: v.register, quantity: 0 })).rejects.toThrow();
    await expect(setQuoteLine(repB, { schoolId: schoolA, variantId: v.register, quantity: 0 })).rejects.toThrow("SCHOOL_UNAVAILABLE");

    await setQuoteLine(repA, { schoolId: schoolA, variantId: v.register, quantity: 250 });
    await setQuoteLine(repA, { schoolId: schoolA, variantId: v.chalk, quantity: 0 });
    expect((await quoteBasketView(schoolA)).lines.map((line) => [line.name, line.quantity])).toEqual([["register", 250]]);

    await setSchoolActive(owner, { schoolId: schoolA, active: false });
    await expect(addToQuote(repA, { schoolId: schoolA, variantId: v.register, quantity: 1 })).rejects.toThrow("SCHOOL_UNAVAILABLE");
  });

  it("sends the basket as a numbered request, and refuses a basket that just changed", async () => {
    await expect(submitQuoteRequest(repA, { schoolId: schoolA, rev: 0 })).rejects.toThrow("changed the basket");
    await addToQuote(repA, { schoolId: schoolA, variantId: v.register, quantity: 500 });
    const { rev } = await quoteBasketView(schoolA);
    await addToQuote(repA2, { schoolId: schoolA, variantId: v.chalk, quantity: 40 });
    await expect(submitQuoteRequest(repA, { schoolId: schoolA, rev })).rejects.toThrow("Someone at your school changed the basket");
    await expect(
      submitQuoteRequest(repA, { schoolId: schoolA, rev: rev + 1, neededBy: istDatePlus(-1) }),
    ).rejects.toThrow("from today on");

    const first = await submitQuoteRequest(repA, { schoolId: schoolA, rev: rev + 1, note: "Deliver to the office" });
    const day = istDate(new Date()).replaceAll("-", "");
    expect(first.number).toBe(`AGSQ-${day}-00001`);
    const request = await QuoteRequest.findById(first.id);
    expect(request).toMatchObject({ status: "requested", note: "Deliver to the office", currentVersion: 0 });
    expect(request.items.map((item: { name: string; quantity: number; schoolPricePaise?: number; shopPricePaise: number }) => [
      item.name,
      item.quantity,
      item.schoolPricePaise,
      item.shopPricePaise,
    ])).toEqual([
      ["register", 500, 4250, 11800],
      ["chalk", 40, undefined, 11800],
    ]);
    expect((await quoteBasketView(schoolA)).lines).toEqual([]);
    await expect(submitQuoteRequest(repA, { schoolId: schoolA, rev: rev + 2 })).rejects.toThrow("Add something to the basket first");
    expect(await Notification.countDocuments({ userId: owner, title: /Quotation request/ })).toBe(1);
    expect(await AuditLog.countDocuments({ action: "quote.request" })).toBe(1);

    expect((await ask([["register", 10]])).number).toBe(`AGSQ-${day}-00002`);
  });

  it("asks for an item that stopped being offered to be taken out first", async () => {
    await addToQuote(repA, { schoolId: schoolA, variantId: v.register, quantity: 500 });
    await Product.updateOne({ _id: p.register }, { $set: { showToSchools: false } });
    const basket = await quoteBasketView(schoolA);
    expect(basket.lines).toEqual([]);
    expect(basket.unavailable).toEqual([{ variantId: v.register, name: "register", label: "Pack" }]);
    await expect(submitQuoteRequest(repA, { schoolId: schoolA, rev: basket.rev })).rejects.toThrow(
      "Remove register: it is no longer in the school catalogue",
    );
    await setQuoteLine(repA, { schoolId: schoolA, variantId: v.register, quantity: 0 });
    expect((await quoteBasketView(schoolA)).unavailable).toEqual([]);
  });

  it("shows a quotation only to the owner and that school's representatives", async () => {
    const { id } = await ask();
    expect((await quotationForViewer({ id: repA2, roles: ["customer"] }, id))?.as).toBe("rep");
    expect((await quotationForViewer({ id: owner, roles: ["customer", "super-admin"] }, id))?.as).toBe("owner");
    expect(await quotationForViewer({ id: repB, roles: ["customer"] }, id)).toBeNull();
    expect(await quotationForViewer({ id: admin, roles: ["customer", "admin"] }, id)).toBeNull();
    expect(await quotationForViewer({ id: repA, roles: ["customer"] }, "nope")).toBeNull();
  });

  it("prices a request line by line, sends it with GST and emails the representatives", async () => {
    const { id } = await ask();
    const lines = [
      { variantId: v.register, quantity: 500, unitPricePaise: 4250, gstRatePercent: 18, hsnCode: "4820" },
      { variantId: v.chalk, quantity: 40, unitPricePaise: 11238, gstRatePercent: 5 },
    ];
    await expect(saveQuoteDraft(admin, id, sheet(lines))).rejects.toThrow("FORBIDDEN");
    await expect(
      saveQuoteDraft(owner, id, sheet([{ ...lines[0], unitPricePaise: undefined }, lines[1]])),
    ).rejects.toThrow("Check register (Pack): enter a price");
    await expect(saveQuoteDraft(owner, id, sheet([lines[0], { ...lines[1], gstRatePercent: 12 }]))).rejects.toThrow(
      "Check chalk (Pack): choose a GST rate",
    );
    await expect(saveQuoteDraft(owner, id, sheet([{ ...lines[0], hsnCode: "48" }, lines[1]]))).rejects.toThrow("HSN code");
    await expect(
      saveQuoteDraft(owner, id, sheet([{ ...lines[0], variantId: v["shop-pen"] }])),
    ).rejects.toThrow("didn’t ask for");
    await expect(saveQuoteDraft(owner, id, sheet(lines.map((line) => ({ ...line, quantity: 0 }))))).rejects.toThrow(
      "Keep at least one item",
    );
    await expect(saveQuoteDraft(owner, id, sheet(lines, { validUntil: istDatePlus(-1) }))).rejects.toThrow("valid-until");
    await expect(saveQuoteDraft(owner, id, sheet(lines, { discount: { type: "percent", percent: 95 } }))).rejects.toThrow(
      "Check the discount",
    );

    const { stamp } = await saveQuoteDraft(owner, id, sheet(lines, { discount: { type: "percent", percent: 10 }, note: "Two lots" }));
    await expect(sendQuotation(owner, { requestId: id, stamp: new Date(0).toISOString() })).rejects.toThrow("The draft changed");

    // Resend answers the first email and fails the second; the placeholder address is never tried
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Agarwal <quotes@example.com>";
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await addRepresentative(owner, { schoolId: schoolA, userId: outsider });
    await User.updateOne({ _id: outsider }, { $set: { email: "shopper@example.com" } });
    const sent = await sendQuotation(owner, { requestId: id, stamp });
    expect(sent).toMatchObject({ version: 1, sent: 1, noEmail: 1, failed: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.subject).toMatch(/Quotation AGSQ-/);

    // 500 × ₹42.50 + 40 × ₹112.38 = ₹25,745.20; 10% off = ₹2,574.52 → taxable ₹23,170.68
    const request = await QuoteRequest.findById(id);
    const version = request.versions[0];
    expect(request).toMatchObject({ status: "quoted", currentVersion: 1 });
    expect(version).toMatchObject({
      supply: "intra",
      subtotalPaise: 2574520,
      discountPaise: 257452,
      taxablePaise: 2317068,
      discountLabel: "Discount (10%)",
      note: "Two lots",
      emailed: { sent: 1, noEmail: 1, failed: 1 },
    });
    expect(version.seller).toMatchObject({ gstin: "27AAPFU0939F1ZV", stateCode: "27" });
    expect(version.buyer).toMatchObject({ name: "Vidya Mandir", stateCode: "27" });
    expect(version.cgstPaise).toBe(version.sgstPaise);
    expect(version.igstPaise).toBe(0);
    expect(version.totalPaise).toBe(version.taxablePaise + version.cgstPaise + version.sgstPaise);
    expect(version.lines.map((line: { hsnCode?: string }) => line.hsnCode)).toEqual(["4820", undefined]);
    expect(await Notification.countDocuments({ userId: repA2, title: /Quotation AGSQ-/ })).toBe(1);
    expect(await Notification.countDocuments({ userId: repB })).toBe(1); // only "you can now ask" from being added

    await expect(sendQuotation(owner, { requestId: id, stamp })).rejects.toThrow("Nothing to send");
  });

  it("works out IGST for a school in another state", async () => {
    await addToQuote(repB, { schoolId: schoolB, variantId: v.register, quantity: 100 });
    const { rev } = await quoteBasketView(schoolB);
    const { id } = await submitQuoteRequest(repB, { schoolId: schoolB, rev });
    const { stamp } = await saveQuoteDraft(
      owner,
      id,
      sheet([{ variantId: v.register, quantity: 100, unitPricePaise: 4250, gstRatePercent: 18 }]),
    );
    await sendQuotation(owner, { requestId: id, stamp });
    const version = (await QuoteRequest.findById(id)).versions[0];
    expect(version).toMatchObject({ supply: "inter", taxablePaise: 425000, igstPaise: 76500, cgstPaise: 0, totalPaise: 501500 });
  });

  it("goes back and forth until the school accepts, and then it's settled", async () => {
    const { id } = await ask([["register", 500]]);
    const line = { variantId: v.register, quantity: 500, unitPricePaise: 4250, gstRatePercent: 18 };
    let { stamp } = await saveQuoteDraft(owner, id, sheet([line]));
    await sendQuotation(owner, { requestId: id, stamp });

    await expect(respondToQuotation(repB, { requestId: id, version: 1, decision: "accept" })).rejects.toThrow("unavailable");
    await expect(respondToQuotation(repA2, { requestId: id, version: 1, decision: "changes", note: "no" })).rejects.toThrow(
      "short note",
    );
    await respondToQuotation(repA2, { requestId: id, version: 1, decision: "changes", note: "Can you do ₹40 for 500?" });
    expect(await QuoteRequest.findById(id)).toMatchObject({ status: "changes-requested" });
    expect(await Notification.countDocuments({ userId: owner, title: /asked for changes/ })).toBe(1);
    await expect(respondToQuotation(repA, { requestId: id, version: 1, decision: "accept" })).rejects.toThrow("A newer quotation");

    ({ stamp } = await saveQuoteDraft(owner, id, sheet([{ ...line, unitPricePaise: 4000 }])));
    expect((await sendQuotation(owner, { requestId: id, stamp })).version).toBe(2);
    await expect(respondToQuotation(repA, { requestId: id, version: 1, decision: "accept" })).rejects.toThrow("A newer quotation");
    await respondToQuotation(repA, { requestId: id, version: 2, decision: "accept" });
    const request = await QuoteRequest.findById(id);
    expect(request.status).toBe("accepted");
    expect(request.versions.map((v: { response?: { kind: string } }) => v.response?.kind)).toEqual(["changes", "accepted"]);
    // the first version is kept exactly as it was sent
    expect(request.versions[0].lines[0].unitPricePaise).toBe(4250);
    await expect(saveQuoteDraft(owner, id, sheet([line]))).rejects.toThrow("closed");
    await expect(closeQuoteRequest(owner, { requestId: id, reason: "No longer needed" })).rejects.toThrow("already closed or accepted");
    expect(await AuditLog.countDocuments({ action: /^quote\./ })).toBe(7);
  });

  it("won't accept an expired quotation, but changes can still be asked for", async () => {
    const { id } = await ask([["register", 5]]);
    const { stamp } = await saveQuoteDraft(
      owner,
      id,
      sheet([{ variantId: v.register, quantity: 5, unitPricePaise: 4250, gstRatePercent: 18 }]),
    );
    await sendQuotation(owner, { requestId: id, stamp });
    await QuoteRequest.updateOne({ _id: id }, { $set: { "versions.0.validUntil": istDatePlus(-1) } });
    await expect(respondToQuotation(repA, { requestId: id, version: 1, decision: "accept" })).rejects.toThrow("expired");
    await respondToQuotation(repA, { requestId: id, version: 1, decision: "changes", note: "Please send a fresh one" });
  });

  it("closes a request with a reason the school sees", async () => {
    const { id } = await ask();
    await expect(closeQuoteRequest(owner, { requestId: id, reason: "no" })).rejects.toThrow("short reason");
    await expect(closeQuoteRequest(admin, { requestId: id, reason: "Out of stock this term" })).rejects.toThrow("FORBIDDEN");
    await closeQuoteRequest(owner, { requestId: id, reason: "Out of stock this term" });
    expect(await QuoteRequest.findById(id)).toMatchObject({ status: "closed", closedReason: "Out of stock this term" });
    expect(await Notification.countDocuments({ userId: repA2, title: /was closed/ })).toBe(1);
    await expect(
      saveQuoteDraft(owner, id, sheet([{ variantId: v.register, quantity: 1, unitPricePaise: 1, gstRatePercent: 18 }])),
    ).rejects.toThrow("closed");
  });
});
