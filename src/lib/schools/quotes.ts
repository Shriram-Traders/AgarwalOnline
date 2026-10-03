import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, Product, ProductVariant, User } from "../db/models";
import { Sequence } from "../commerce/models";
import { objectId } from "../commerce/service";
import { istDate } from "../commerce/delivery";
import { assertPermission, hasPermission, type Role } from "../auth/permissions";
import { isSchoolVisible } from "../catalog/visibility";
import { HSN_RE, isGstRate, optionalField, stateOfGstin } from "../tax/gst";
import { taxProfile } from "../tax/profile";
import { isPlaceholderEmail, sendEmail } from "../email/send";
import { quotationEmail } from "../email/templates";
import { getEnv } from "../env";
import { quoteMoney } from "./display";
import { log } from "../logger";
import { QuoteBasket, QuoteRequest, School, SchoolMember } from "./models";
import { assertMember } from "./membership";
import { notifyOwners, notifyRepresentatives } from "./notify";
import {
  LIMITS,
  isExpired,
  istDatePlus,
  quoteNumber,
  quoteTotals,
  supplyType,
  type Discount,
} from "./quote-math";
import type { Sheet } from "./quote-form";

/*
 * A school's quote basket, the quotation requests it sends, and the owner's quotations back.
 * Representatives only ever touch their own school's records; the owner (settings:write) prices
 * and sends. Sent quotations are frozen copies, so later price changes never alter them.
 */

const OPEN = ["requested", "quoted", "changes-requested"];

async function owner(actorId: string) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  return actor;
}

// ---------- the shared quote basket ----------

export type QuoteLine = {
  variantId: string;
  productId: string;
  name: string;
  label: string;
  image?: string;
  slug: string;
  quantity: number;
  schoolPricePaise?: number;
  gstRatePercent?: number;
  addedBy: string;
};

/** The school's basket as its representatives see it. Call only after the membership check. */
export async function quoteBasketView(schoolId: string) {
  await connectDB();
  const basket = await QuoteBasket.findOne({ schoolId });
  const items: { variantId: unknown; quantity: number; addedBy: unknown }[] = basket?.items ?? [];
  const lines: QuoteLine[] = [];
  const unavailable: { variantId: string; name: string; label: string }[] = [];
  if (items.length) {
    const variants = await ProductVariant.find({ _id: { $in: items.map((item) => item.variantId) } });
    const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } });
    const people = await User.find({ _id: { $in: items.map((item) => item.addedBy) } }).select("name");
    for (const item of items) {
      const variant = variants.find((v) => String(v._id) === String(item.variantId));
      const product = products.find((p) => String(p._id) === String(variant?.productId));
      if (!variant || variant.active === false || !isSchoolVisible(product)) {
        unavailable.push({
          variantId: String(item.variantId),
          name: product?.name.en ?? "An item no longer offered",
          label: variant?.label ?? "",
        });
        continue;
      }
      lines.push({
        variantId: String(variant._id),
        productId: String(product._id),
        name: product.name.en,
        label: variant.label,
        image: product.images?.[0] ?? product.image,
        slug: product.slug,
        quantity: item.quantity,
        schoolPricePaise: variant.schoolPricePaise ?? undefined,
        gstRatePercent: product.gstRatePercent ?? undefined,
        addedBy: people.find((p) => String(p._id) === String(item.addedBy))?.name ?? "Someone at your school",
      });
    }
  }
  return { rev: Number(basket?.rev ?? 0), lines, unavailable };
}

/** Adds to the school's basket; an item already there gets the extra quantity. */
export async function addToQuote(userId: string, input: unknown) {
  const data = z
    .object({
      schoolId: objectId,
      variantId: objectId,
      quantity: z.coerce.number().int().min(1).max(LIMITS.quantity),
    })
    .parse(input);
  await assertMember(userId, data.schoolId);
  const variant = await ProductVariant.findById(data.variantId);
  const product = variant ? await Product.findById(variant.productId) : null;
  if (!variant || variant.active === false || !isSchoolVisible(product))
    throw Error("This product isn’t in the school catalogue.");
  const basket = await QuoteBasket.findOneAndUpdate(
    { schoolId: data.schoolId },
    { $setOnInsert: { schoolId: data.schoolId, items: [], rev: 0 } },
    { upsert: true, returnDocument: "after" },
  );
  const line = basket.items.find((item: { variantId: unknown }) => String(item.variantId) === data.variantId);
  if (line) {
    const quantity = Math.min(LIMITS.quantity, line.quantity + data.quantity);
    await QuoteBasket.updateOne(
      { _id: basket._id, "items.variantId": data.variantId },
      { $set: { "items.$.quantity": quantity }, $inc: { rev: 1 } },
    );
    return { quantity };
  }
  if (basket.items.length >= LIMITS.lines)
    throw Error(`This basket holds up to ${LIMITS.lines} items. Ask for a quotation for these first.`);
  const pushed = await QuoteBasket.updateOne(
    { _id: basket._id, "items.variantId": { $ne: data.variantId } },
    { $push: { items: { variantId: data.variantId, quantity: data.quantity, addedBy: userId } }, $inc: { rev: 1 } },
  );
  // someone at the school added the same item at the same moment: add to theirs
  if (!pushed.modifiedCount)
    await QuoteBasket.updateOne(
      { _id: basket._id, "items.variantId": data.variantId },
      { $inc: { "items.$.quantity": data.quantity, rev: 1 } },
    );
  return { quantity: data.quantity };
}

/** Sets a basket line's quantity; 0 takes it out. Taking out always works, even for items no longer offered. */
export async function setQuoteLine(userId: string, input: unknown) {
  const data = z
    .object({
      schoolId: objectId,
      variantId: objectId,
      quantity: z.coerce.number().int().min(0).max(LIMITS.quantity),
    })
    .parse(input);
  await assertMember(userId, data.schoolId);
  if (!data.quantity) {
    await QuoteBasket.updateOne(
      { schoolId: data.schoolId },
      { $pull: { items: { variantId: data.variantId } }, $inc: { rev: 1 } },
    );
    return;
  }
  const updated = await QuoteBasket.updateOne(
    { schoolId: data.schoolId, "items.variantId": data.variantId },
    { $set: { "items.$.quantity": data.quantity }, $inc: { rev: 1 } },
  );
  if (!updated.matchedCount) throw Error("This item is no longer in the basket.");
}

/** Sends the school's basket to the store as a numbered quotation request, and empties it. */
export async function submitQuoteRequest(userId: string, input: unknown) {
  const data = z
    .object({
      schoolId: objectId,
      rev: z.coerce.number().int().min(0),
      note: optionalField(z.string().trim().max(1000)),
      neededBy: optionalField(z.iso.date("Choose a needed-by date, or leave it blank.")),
    })
    .parse(input);
  const school = await assertMember(userId, data.schoolId);
  if (data.neededBy && data.neededBy < istDate(new Date()))
    throw Error("Choose a needed-by date from today on, or leave it blank.");
  let id = "";
  let number = "";
  let lines = 0;
  await mongoose.connection.transaction(async (session) => {
    const basket = await QuoteBasket.findOne({ schoolId: data.schoolId }).session(session);
    if (!basket || Number(basket.rev) !== data.rev)
      throw Error("Someone at your school changed the basket just now. Check it and send again.");
    if (!basket.items.length) throw Error("Add something to the basket first.");
    const variants = await ProductVariant.find({
      _id: { $in: basket.items.map((item: { variantId: unknown }) => item.variantId) },
    }).session(session);
    const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } }).session(session);
    const items = basket.items.map((item: { variantId: unknown; quantity: number; addedBy: unknown }) => {
      const variant = variants.find((v) => String(v._id) === String(item.variantId));
      const product = products.find((p) => String(p._id) === String(variant?.productId));
      if (!variant || variant.active === false || !isSchoolVisible(product))
        throw Error(`Remove ${product?.name.en ?? "the item marked as no longer offered"}: it is no longer in the school catalogue.`);
      return {
        variantId: variant._id,
        productId: product._id,
        name: product.name.en,
        label: variant.label,
        sku: variant.sku,
        quantity: item.quantity,
        schoolPricePaise: variant.schoolPricePaise ?? undefined,
        shopPricePaise: variant.pricePaise,
        gstRatePercent: product.gstRatePercent ?? undefined,
        hsnCode: product.hsnCode ?? undefined,
        addedBy: item.addedBy,
      };
    });
    const day = istDate(new Date()).replaceAll("-", "");
    // its own counter: order numbers use the bare day
    const sequence = await Sequence.findOneAndUpdate(
      { key: `quote-${day}` },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
    number = quoteNumber(day, sequence.value);
    const [request] = await QuoteRequest.create(
      [{ number, schoolId: data.schoolId, requestedBy: userId, note: data.note, neededBy: data.neededBy, items }],
      { session },
    );
    id = String(request._id);
    lines = items.length;
    await QuoteBasket.updateOne({ _id: basket._id }, { $set: { items: [] }, $inc: { rev: 1 } }, { session });
    await AuditLog.create(
      [{ actorId: userId, action: "quote.request", target: id, details: { number, lines, schoolId: data.schoolId } }],
      { session },
    );
  });
  await notifyOwners({
    title: `Quotation request ${number} from ${school.name}`,
    body: `${lines} ${lines === 1 ? "item" : "items"}${data.neededBy ? ` · needed by ${data.neededBy}` : ""}`,
    href: `/super-admin/quotations/${id}`,
  });
  return { id, number };
}

// ---------- the owner's quotation desk ----------

const discountLabel = (discount: Discount) =>
  discount.type === "percent" ? `Discount (${discount.percent}%)` : discount.type === "amount" ? "Discount" : undefined;
export const draftDiscount = (draft: { discountType?: string; discountValue?: number }): Discount =>
  draft.discountType === "percent"
    ? { type: "percent", percent: Number(draft.discountValue) }
    : draft.discountType === "amount"
      ? { type: "amount", paise: Number(draft.discountValue) }
      : { type: "none" };

/** Checks the owner's sheet line by line, naming the line in every message, and saves it as the draft. */
export async function saveQuoteDraft(actorId: string, requestInput: unknown, sheet: Sheet) {
  await owner(actorId);
  const requestId = objectId.parse(requestInput);
  const request = await QuoteRequest.findById(requestId);
  if (!request) throw Error("This quotation request no longer exists.");
  if (!OPEN.includes(request.status)) throw Error("This request is closed, so it can’t be changed.");
  const asked = new Map(
    request.items.map((item: { variantId: unknown }) => [String(item.variantId), item]),
  ) as Map<string, { name: string; label: string }>;
  const lines: { variantId: string; name: string; label: string; hsnCode?: string; gstRatePercent: number; quantity: number; unitPricePaise: number }[] = [];
  for (const line of sheet.lines) {
    const item = asked.get(line.variantId);
    if (!item) throw Error("This sheet has an item the school didn’t ask for. Reload the page and try again.");
    const name = `${item.name} (${item.label})`;
    if (!Number.isInteger(line.quantity) || line.quantity < 0 || line.quantity > LIMITS.quantity)
      throw Error(`Check ${name}: the quantity is a whole number up to ${LIMITS.quantity.toLocaleString("en-IN")}.`);
    if (line.quantity === 0) continue; // a line set to 0 is dropped from the quotation
    const price = line.unitPricePaise;
    if (price == null || !Number.isSafeInteger(price) || price < 0 || price > LIMITS.unitPricePaise)
      throw Error(`Check ${name}: enter a price before GST, up to ${quoteMoney(LIMITS.unitPricePaise)}.`);
    if (!isGstRate(line.gstRatePercent)) throw Error(`Check ${name}: choose a GST rate.`);
    if (line.hsnCode && !HSN_RE.test(line.hsnCode)) throw Error(`Check ${name}: the HSN code is 4, 6 or 8 digits.`);
    if (line.quantity * price > LIMITS.linePaise) throw Error(`Check ${name}: this line is too large for one quotation.`);
    lines.push({
      variantId: line.variantId,
      name: item.name,
      label: item.label,
      hsnCode: line.hsnCode,
      gstRatePercent: line.gstRatePercent,
      quantity: line.quantity,
      unitPricePaise: price,
    });
  }
  if (!lines.length) throw Error("Keep at least one item on the quotation, or close the request instead.");
  const subtotal = lines.reduce((n, line) => n + line.quantity * line.unitPricePaise, 0);
  const discount = sheet.discount;
  if (discount.type === "percent" && (!Number.isInteger(discount.percent) || discount.percent < 1 || discount.percent > 90))
    throw Error("Check the discount: a whole percent from 1 to 90.");
  if (discount.type === "amount" && (!Number.isSafeInteger(discount.paise) || discount.paise < 1 || discount.paise > subtotal))
    throw Error(`Check the discount: from ₹0.01 up to the items’ total of ${quoteMoney(subtotal)}.`);
  const today = istDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sheet.validUntil) || sheet.validUntil < today || sheet.validUntil > istDatePlus(365))
    throw Error("Choose a valid-until date from today to a year ahead.");
  if (quoteTotals(lines, discount, "intra").totalPaise > LIMITS.totalPaise)
    throw Error("Check the prices: this quotation is too large to send in one go.");
  const updatedAt = new Date();
  await mongoose.connection.transaction(async (session) => {
    const saved = await QuoteRequest.updateOne(
      { _id: requestId, status: { $in: OPEN } },
      {
        $set: {
          draft: {
            lines,
            discountType: discount.type,
            discountValue: discount.type === "percent" ? discount.percent : discount.type === "amount" ? discount.paise : 0,
            validUntil: sheet.validUntil,
            note: sheet.note,
            updatedBy: actorId,
            updatedAt,
          },
        },
      },
      { session },
    );
    if (!saved.modifiedCount) throw Error("This request is closed, so it can’t be changed.");
    await AuditLog.create(
      [{ actorId, action: "quote.draft.save", target: requestId, details: { lines: lines.length, subtotalPaise: subtotal } }],
      { session },
    );
  });
  return { stamp: updatedAt.toISOString() };
}

/**
 * Freezes the draft as the next version of the quotation and tells the school. `stamp` is the
 * draft the owner was looking at: if it changed since, nothing is sent.
 */
export async function sendQuotation(actorId: string, input: unknown) {
  await owner(actorId);
  const data = z.object({ requestId: objectId, stamp: z.string().min(1) }).parse(input);
  const seller = await taxProfile();
  let sent: {
    id: string;
    number: string;
    version: number;
    schoolId: string;
    schoolName: string;
    validUntil: string;
    supply: "intra" | "inter";
    lines: { name: string; label: string; quantity: number; taxablePaise: number; gstRatePercent: number }[];
    totals: ReturnType<typeof quoteTotals>;
  } | null = null;
  await mongoose.connection.transaction(async (session) => {
    const request = await QuoteRequest.findById(data.requestId).session(session);
    if (!request) throw Error("This quotation request no longer exists.");
    if (!OPEN.includes(request.status)) throw Error("This request is closed, so nothing can be sent.");
    const draft = request.draft;
    if (!draft?.lines?.length) throw Error("Save the prices first, then send.");
    if (new Date(draft.updatedAt).toISOString() !== data.stamp)
      throw Error("The draft changed since this page opened. Check it and send again.");
    if (request.currentVersion > 0 && draft.sentAsVersion === request.currentVersion)
      throw Error("Nothing to send: this draft has already been sent. Change something first.");
    if (draft.validUntil < istDate(new Date()))
      throw Error("Choose a valid-until date from today on, save, then send.");
    const school = await School.findById(request.schoolId).session(session);
    if (!school) throw Error("This school no longer exists.");
    const buyerState = school.stateCode ?? stateOfGstin(school.gstin);
    const supply = supplyType(seller.stateCode, buyerState);
    const discount = draftDiscount(draft);
    const lines = draft.lines.map((line: { quantity: number; unitPricePaise: number; gstRatePercent: number }) => ({
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      gstRatePercent: line.gstRatePercent,
    }));
    const totals = quoteTotals(lines, discount, supply);
    const version = request.currentVersion + 1;
    const frozen = draft.lines.map(
      (line: { variantId: unknown; name: string; label: string; hsnCode?: string }, i: number) => ({
        variantId: line.variantId,
        name: line.name,
        label: line.label,
        hsnCode: line.hsnCode,
        ...lines[i],
        ...totals.lines[i],
      }),
    );
    request.versions.push({
      version,
      sentAt: new Date(),
      sentBy: actorId,
      validUntil: draft.validUntil,
      note: draft.note,
      supply,
      seller: {
        name: seller.legalName,
        gstin: seller.gstin,
        address: seller.address,
        stateCode: seller.stateCode,
        phone: seller.phone,
        email: seller.email,
        terms: seller.terms,
      },
      buyer: {
        name: school.name,
        gstin: school.gstin,
        address: school.address,
        pin: school.pin,
        stateCode: buyerState,
        phone: school.phone,
        email: school.email,
      },
      lines: frozen,
      taxes: totals.taxes,
      subtotalPaise: totals.subtotalPaise,
      discountPaise: totals.discountPaise,
      discountLabel: discountLabel(discount),
      taxablePaise: totals.taxablePaise,
      cgstPaise: totals.cgstPaise,
      sgstPaise: totals.sgstPaise,
      igstPaise: totals.igstPaise,
      totalPaise: totals.totalPaise,
    });
    request.currentVersion = version;
    request.status = "quoted";
    request.draft.sentAsVersion = version;
    await request.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "quote.send",
          target: String(request._id),
          details: { version, totalPaise: totals.totalPaise, lines: frozen.length },
        },
      ],
      { session },
    );
    sent = {
      id: String(request._id),
      number: request.number,
      version,
      schoolId: String(school._id),
      schoolName: school.name,
      validUntil: draft.validUntil,
      supply,
      lines: frozen,
      totals,
    };
  });
  const quote = sent!;
  await notifyRepresentatives(quote.schoolId, {
    title: `Quotation ${quote.number}${quote.version > 1 ? ` (version ${quote.version})` : ""} from ${seller.legalName}`,
    body: `Total ${quoteMoney(quote.totals.totalPaise)} with GST · valid until ${quote.validUntil}`,
    href: `/school/quotations/${quote.id}`,
  });
  const emailed = await emailRepresentatives(quote, seller.legalName, !seller.gstin);
  await QuoteRequest.updateOne(
    { _id: quote.id, "versions.version": quote.version },
    { $set: { "versions.$.emailed": emailed } },
  );
  return { version: quote.version, totalPaise: quote.totals.totalPaise, ...emailed };
}

/** Emails each representative with a real address; the quotation is already saved either way. */
async function emailRepresentatives(
  quote: {
    id: string;
    number: string;
    version: number;
    schoolId: string;
    schoolName: string;
    validUntil: string;
    supply: "intra" | "inter";
    lines: { name: string; label: string; quantity: number; taxablePaise: number; gstRatePercent: number }[];
    totals: ReturnType<typeof quoteTotals>;
  },
  sellerName: string,
  gstinMissing: boolean,
) {
  const counts = { sent: 0, noEmail: 0, failed: 0 };
  const members = await SchoolMember.find({ schoolId: quote.schoolId }).select("userId");
  const people = await User.find({ _id: { $in: members.map((m) => m.userId) }, active: true }).select("name email");
  const url = `${getEnv().APP_ORIGIN}/school/quotations/${quote.id}`;
  for (const person of people) {
    if (isPlaceholderEmail(person.email)) {
      counts.noEmail += 1;
      continue;
    }
    try {
      await sendEmail({
        to: person.email,
        ...quotationEmail({
          repName: person.name,
          sellerName,
          schoolName: quote.schoolName,
          number: quote.number,
          version: quote.version,
          validUntil: quote.validUntil,
          lines: quote.lines,
          totals: quote.totals,
          supply: quote.supply,
          gstinMissing,
          url,
        }),
      });
      counts.sent += 1;
    } catch (error) {
      counts.failed += 1;
      log("warn", "quote.email-failed", { error, quote: quote.number });
    }
  }
  return counts;
}

/** The school accepts the current quotation, or asks for changes with a note. */
export async function respondToQuotation(userId: string, input: unknown) {
  const data = z
    .object({
      requestId: objectId,
      version: z.coerce.number().int().min(1),
      decision: z.enum(["accept", "changes"]),
      note: optionalField(z.string().trim().max(1000)),
    })
    .parse(input);
  await connectDB();
  const request = await QuoteRequest.findById(data.requestId);
  if (!request) throw Error("This quotation is unavailable.");
  const school = await assertMember(userId, String(request.schoolId)).catch(() => {
    throw Error("This quotation is unavailable.");
  });
  if (request.status !== "quoted" || request.currentVersion !== data.version)
    throw Error("A newer quotation was sent, or this one was already answered. Check it first.");
  const current = request.versions.find((v: { version: number }) => v.version === data.version);
  if (data.decision === "accept" && isExpired(current.validUntil))
    throw Error("This quotation has expired. Ask for changes to get a fresh one.");
  if (data.decision === "changes" && (!data.note || data.note.length < 5))
    throw Error("Ask for changes with a short note of what to change.");
  const accepted = data.decision === "accept";
  await mongoose.connection.transaction(async (session) => {
    const updated = await QuoteRequest.findOneAndUpdate(
      { _id: data.requestId, status: "quoted", currentVersion: data.version, "versions.version": data.version },
      {
        $set: {
          status: accepted ? "accepted" : "changes-requested",
          "versions.$.response": { kind: accepted ? "accepted" : "changes", note: data.note, by: userId, at: new Date() },
        },
      },
      { session, returnDocument: "after" },
    );
    if (!updated) throw Error("A newer quotation was sent, or this one was already answered. Check it first.");
    await AuditLog.create(
      [
        {
          actorId: userId,
          action: accepted ? "quote.accept" : "quote.changes",
          target: data.requestId,
          details: { version: data.version, note: data.note },
        },
      ],
      { session },
    );
  });
  await notifyOwners({
    title: accepted ? `${school.name} accepted ${request.number}` : `${school.name} asked for changes to ${request.number}`,
    body: accepted
      ? `Version ${data.version} · ${quoteMoney(current.totalPaise)} with GST`
      : (data.note ?? "Open the request to see what they asked."),
    href: `/super-admin/quotations/${data.requestId}`,
  });
}

/** The owner closes a request that won't be quoted (or won't go further); the school is told. */
export async function closeQuoteRequest(actorId: string, input: unknown) {
  await owner(actorId);
  const data = z.object({ requestId: objectId, reason: z.string().trim().min(5, "Give a short reason, so the school knows why.").max(300) }).parse(input);
  let closed: { schoolId: unknown; number: string } | null = null;
  await mongoose.connection.transaction(async (session) => {
    const request = await QuoteRequest.findOneAndUpdate(
      { _id: data.requestId, status: { $in: OPEN } },
      { $set: { status: "closed", closedReason: data.reason, closedBy: actorId, closedAt: new Date() } },
      { session, returnDocument: "after" },
    );
    if (!request) throw Error("This request is already closed or accepted.");
    closed = { schoolId: request.schoolId, number: request.number };
    await AuditLog.create([{ actorId, action: "quote.close", target: data.requestId, details: { reason: data.reason } }], {
      session,
    });
  });
  const done = closed as unknown as { schoolId: unknown; number: string };
  await notifyRepresentatives(done.schoolId, {
    title: `Quotation request ${done.number} was closed`,
    body: data.reason,
    href: `/school/quotations/${data.requestId}`,
  });
}

/**
 * A quotation for someone who may look at it: an owner, or a representative of its (active)
 * school. Anyone else gets null, the same as for a quotation that doesn't exist.
 */
export async function quotationForViewer(viewer: { id: string; roles: Role[] }, idInput: unknown) {
  const parsed = objectId.safeParse(idInput);
  if (!parsed.success) return null;
  await connectDB();
  const request = await QuoteRequest.findById(parsed.data);
  if (!request) return null;
  if (hasPermission(viewer.roles, "settings:write")) return { request, as: "owner" as const };
  try {
    await assertMember(viewer.id, String(request.schoolId));
    return { request, as: "rep" as const };
  } catch {
    return null;
  }
}
