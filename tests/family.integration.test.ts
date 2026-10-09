import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, ServiceArea, User } from "../src/lib/db/models";
import { Address, CartLine, DeliverySlot, Order } from "../src/lib/commerce/models";
import { checkout } from "../src/lib/commerce/service";
import { Notification } from "../src/lib/engagement/models";
import { Refund } from "../src/lib/payments/models";
import { Family } from "../src/lib/family/models";
import * as family from "../src/lib/family/service";

const uri = process.env.TEST_MONGODB_URI;
describe("the school year", () => {
  it("turns over in June, on the IST calendar", () => {
    expect(family.academicYear(new Date("2026-05-31T12:00:00Z"))).toBe("2025-26");
    expect(family.academicYear(new Date("2026-05-31T19:00:00Z"))).toBe("2026-27"); // already 1 June in India
    expect(family.academicYear(new Date("2099-12-31T00:00:00Z"))).toBe("2099-00");
  });
});

describe.skipIf(!uri)("Families", () => {
  let owner: string, partner: string, stranger: string, variant: string, slot: string;
  const addresses: Record<string, string> = {};
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const m of [User, Family, Order, CartLine, Notification, InventoryItem, DeliverySlot]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    const users = await User.create([
      { name: "Priya Sharma", phone: "9000000081", roles: ["customer"] },
      { name: "Rohan Sharma", phone: "9000000082", roles: ["customer"] },
      { name: "Stranger Person", phone: "9000000083", roles: ["customer"] },
    ]);
    [owner, partner, stranger] = users.map((u: { _id: unknown }) => String(u._id));
    const category = await Category.create({ slug: "school", name: { en: "School", mr: "शाळा" } });
    const product = await Product.create({
      slug: "family-notebook",
      name: { en: "Family Notebook", mr: "वही" },
      description: { en: "Fictional", mr: "प्रात्यक्षिक" },
      categoryId: category._id,
      categorySlug: "school",
      status: "published",
    });
    const v = await ProductVariant.create({
      productId: product._id,
      sku: "FAMILY-NB",
      label: "1 pc",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 10000,
      mrpPaise: 12000,
    });
    variant = String(v._id);
    await InventoryItem.create({ variantId: v._id, onHand: 50 });
    const area = await ServiceArea.create({ key: "fictional", name: "Fictional zone", pincodes: ["999999"], enabled: true, feePaise: 0 });
    for (const [id, phone] of [[owner, "9000000081"], [partner, "9000000082"], [stranger, "9000000083"]]) {
      const address = await Address.create({ customerId: id, name: "Test", phone, line: "Fictional", pin: "999999", areaId: area._id });
      addresses[id] = String(address._id);
    }
    slot = String((await DeliverySlot.create({ areaId: area._id, date: "2099-01-01", label: "10–12", capacity: 50 }))._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const buy = async (customer: string, forId?: string) => {
    await CartLine.create({ customerId: customer, variantId: variant, quantity: 1 });
    return checkout(customer, {
      addressId: addresses[customer],
      slotId: slot,
      idempotencyKey: randomUUID(),
      method: "cod",
      ...(forId === undefined ? {} : { forId }),
    });
  };
  const familyOfOwner = async () => (await family.familyOf(owner))!;

  it("keeps a person in one family, and lets each invite link in one person", async () => {
    await family.createFamily(owner, "Sharma family");
    await expect(family.createFamily(owner, "Again")).rejects.toThrow("already in a family");
    const link = (await familyOfOwner()).inviteToken;
    await family.joinFamily(partner, link);
    expect((await familyOfOwner()).adults.map(String)).toEqual([owner, partner]);
    expect(await Notification.exists({ userId: owner, type: "family" })).toBeTruthy();
    await expect(family.joinFamily(stranger, link)).rejects.toThrow("used or replaced");
    await expect(family.createFamily(partner, "Rohan's")).rejects.toThrow("already in a family");
    await family.createFamily(stranger, "Other family");
    const other = (await family.familyOf(stranger))!;
    await expect(family.joinFamily(partner, other.inviteToken)).rejects.toThrow("already in a family");
  });

  it("lets only the owner manage people, never leave, and delete only when alone", async () => {
    await family.createFamily(owner, "Sharma family");
    await family.joinFamily(partner, (await familyOfOwner()).inviteToken);
    await expect(family.removeAdult(partner, owner)).rejects.toThrow("Only the family’s owner");
    await expect(family.resetFamilyLink(partner)).rejects.toThrow("Only the family’s owner");
    await expect(family.leaveFamily(owner)).rejects.toThrow("owner can’t leave");
    await expect(family.deleteFamily(owner)).rejects.toThrow("Remove the other adults");
    await expect(family.deleteFamily(partner)).rejects.toThrow("Only the family’s owner");
    await family.removeAdult(owner, partner);
    expect(await family.familyOf(partner)).toBeNull();
    expect(await Notification.exists({ userId: partner, type: "family" })).toBeTruthy();
    await family.deleteFamily(owner);
    expect(await Family.countDocuments()).toBe(0);
  });

  it("tags checkout with who an order is for, and keeps private orders out", async () => {
    await family.createFamily(owner, "Sharma family");
    await family.saveChild(owner, { name: "Aarav", school: "St. Mary's", className: "5" });
    await family.createFamily(stranger, "Other family");
    await family.saveChild(stranger, { name: "Meera", className: "Sr KG" });
    const aarav = String((await familyOfOwner()).children[0]._id);
    const meera = String((await family.familyOf(stranger))!.children[0]._id);

    const forChild = await Order.findById(await buy(owner, aarav));
    expect(String(forChild.familyId)).toBe(String((await familyOfOwner())._id));
    expect(forChild.forPerson).toMatchObject({ name: "Aarav", child: true });
    await expect(buy(owner, meera)).rejects.toThrow("Select who this order is for.");
    await CartLine.deleteMany({});
    const everyone = await Order.findById(await buy(owner, ""));
    expect(everyone.familyId).toBeTruthy();
    expect(everyone.forPerson?.name).toBeUndefined();
    const kept = await Order.findById(await buy(owner, "private"));
    expect(kept.familyId).toBeUndefined();
    const noFamily = await Order.findById(await buy(partner));
    expect(noFamily.familyId).toBeUndefined();
    await expect(buy(partner, owner)).rejects.toThrow("Select who this order is for.");
  });

  it("adds up spend by IST month, leaving out cancelled, failed, refunded and outside orders", async () => {
    await family.createFamily(owner, "Sharma family");
    await family.joinFamily(partner, (await familyOfOwner()).inviteToken);
    const home = (await familyOfOwner())._id;
    const place = async (customerId: string, at: string, totalPaise: number, extra: object = {}) => {
      const order = await Order.create({
        customerId,
        number: `AGS-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [{ variantId: variant, name: "Family Notebook", label: "1 pc", quantity: 1, pricePaise: totalPaise, linePaise: totalPaise }],
        slotId: slot,
        paymentMethod: "cod",
        totalPaise,
        familyId: home,
        ...extra,
      });
      await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date(at) } });
      return order;
    };
    await place(owner, "2026-08-31T19:00:00Z", 10000, { forPerson: { personId: owner, name: "Priya", child: false } }); // 1 Sep in India
    await place(partner, "2026-09-15T06:00:00Z", 5000, { orderStatus: "cancelled" });
    await place(partner, "2026-09-16T06:00:00Z", 7000, { deliveryStatus: "failed" });
    const refunded = await place(partner, "2026-08-10T06:00:00Z", 20000);
    await Refund.create({ orderId: refunded._id, requestedBy: owner, amountPaise: 5000, reason: "Damaged", mode: "manual", status: "processed" });
    await Refund.create({ orderId: refunded._id, requestedBy: owner, amountPaise: 3000, reason: "Pending", mode: "manual" });
    await place(owner, "2026-09-10T06:00:00Z", 9000, { familyId: undefined });
    await place(stranger, "2026-09-11T06:00:00Z", 9000); // left the family, or never in it
    await place(stranger, "2026-09-12T06:00:00Z", 4000, { paymentMethod: "tab" }); // but what went on the tab stays owed and seen
    await place(owner, "2025-09-30T06:00:00Z", 9000); // older than twelve months

    const spend = await family.familySpend(await familyOfOwner(), new Date("2026-09-28T06:00:00Z"));
    expect(spend.months.map((m) => [m.month, m.totalPaise])).toEqual([
      ["2026-09", 14000],
      ["2026-08", 15000],
    ]);
    expect(spend.totalPaise).toBe(29000);
    expect(spend.people).toEqual([
      { key: "everyone", name: null, totalPaise: 19000 },
      { key: owner, name: "Priya", totalPaise: 10000 },
    ]);
  });

  it("opens a family order's invoice for the family's adults only, never a private one", async () => {
    await family.createFamily(owner, "Sharma family");
    await family.joinFamily(partner, (await familyOfOwner()).inviteToken);
    const shared = await buy(owner, "");
    const kept = await buy(owner, "private");
    const as = (id: string, roles = ["customer"] as const) => ({ id, roles: [...roles] });
    expect(await family.invoiceOrder(as(partner), shared)).toBeTruthy();
    expect(await family.invoiceOrder(as(stranger), shared)).toBeNull();
    expect(await family.invoiceOrder(as(partner), kept)).toBeNull();
    expect(await family.invoiceOrder(as(owner), kept)).toBeTruthy();
    await family.removeAdult(owner, partner);
    expect(await family.invoiceOrder(as(partner), shared)).toBeNull();
    expect(await family.invoiceOrder(as(stranger), "not-an-id")).toBeNull();
  });

  it("lets any adult keep a child's school and class, and nobody else", async () => {
    await family.createFamily(owner, "Sharma family");
    await family.joinFamily(partner, (await familyOfOwner()).inviteToken);
    await family.saveChild(partner, { name: "Aarav", school: "St. Mary's", className: "4" });
    const child = String((await familyOfOwner()).children[0]._id);
    await family.saveChild(owner, { childId: child, name: "Aarav", school: "St. Mary's", className: "5" });
    expect((await familyOfOwner()).children[0]).toMatchObject({ className: "5", year: family.academicYear(new Date()) });
    await expect(family.saveChild(stranger, { childId: child, name: "X", className: "1" })).rejects.toThrow("not in your family");
    await expect(family.saveChild(owner, { name: "Y", className: "Class 5" })).rejects.toThrow("Pick the child’s class.");
    await expect(family.removeChild(stranger, child)).rejects.toThrow("not in your family");
    await family.removeChild(owner, child);
    expect((await familyOfOwner()).children).toHaveLength(0);
  });
});
