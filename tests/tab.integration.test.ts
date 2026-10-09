import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, OTPChallenge, Product, ProductVariant, ServiceArea, User } from "../src/lib/db/models";
import { Address, CartLine, DeliverySlot, Order } from "../src/lib/commerce/models";
import { cancelOrder, checkout } from "../src/lib/commerce/service";
import { Notification } from "../src/lib/engagement/models";
import { CODCollection } from "../src/lib/operations/models";
import {
  assignDelivery,
  changeOrderStatus,
  completeDelivery,
  partnerTransition,
  requestDeliveryOTP,
  savePacking,
} from "../src/lib/operations/service";
import { Refund } from "../src/lib/payments/models";
import { createRefund, processRefund } from "../src/lib/payments/service";
import { Family, TabPayment } from "../src/lib/family/models";
import * as family from "../src/lib/family/service";
import { chargeTab, tabBalance } from "../src/lib/family/checkout";
import * as tab from "../src/lib/family/tab";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Family tab (khata)", () => {
  let parent: string, partner: string, stranger: string, admin: string, boss: string, rider: string;
  let variant: string, slot: string, home: string;
  const addresses: Record<string, string> = {};
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
      MOCK_OTP_CODE: "246810",
    });
    await connectDB();
    for (const m of [User, Family, TabPayment, Order, CartLine, Notification, InventoryItem, DeliverySlot, Refund, OTPChallenge]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    const users = await User.create([
      { name: "Priya Sharma", phone: "9000000061", roles: ["customer"] },
      { name: "Rohan Sharma", phone: "9000000062", roles: ["customer"] },
      { name: "Stranger Person", phone: "9000000063", roles: ["customer"] },
      { name: "Desk Admin", phone: "9000000064", roles: ["customer", "admin"] },
      { name: "Store Owner", phone: "9000000065", roles: ["customer", "super-admin"] },
      { name: "Rider", phone: "9000000066", roles: ["customer", "delivery"] },
    ]);
    [parent, partner, stranger, admin, boss, rider] = users.map((u: { _id: unknown }) => String(u._id));
    const category = await Category.create({ slug: "school", name: { en: "School", mr: "शाळा" } });
    const product = await Product.create({
      slug: "tab-notebook",
      name: { en: "Tab Notebook", mr: "वही" },
      description: { en: "Fictional", mr: "प्रात्यक्षिक" },
      categoryId: category._id,
      categorySlug: "school",
      status: "published",
    });
    variant = String(
      (await ProductVariant.create({ productId: product._id, sku: "TAB-NB", label: "1 pc", unit: "piece", packQuantity: 1, pricePaise: 10000, mrpPaise: 12000 }))._id,
    );
    await InventoryItem.create({ variantId: variant, onHand: 50 });
    const area = await ServiceArea.create({ key: "fictional", name: "Fictional zone", pincodes: ["999999"], enabled: true, feePaise: 0 });
    for (const [id, phone] of [[parent, "9000000061"], [partner, "9000000062"], [stranger, "9000000063"]])
      addresses[id] = String((await Address.create({ customerId: id, name: "Test", phone, line: "Fictional", pin: "999999", areaId: area._id }))._id);
    slot = String((await DeliverySlot.create({ areaId: area._id, date: "2099-01-01", label: "10–12", capacity: 50 }))._id);
    await family.createFamily(parent, "Sharma family");
    await family.joinFamily(partner, (await family.familyOf(parent))!.inviteToken);
    home = String((await family.familyOf(parent))!._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const buy = async (customer: string, method = "tab", forId?: string) => {
    await CartLine.updateOne({ customerId: customer, variantId: variant }, { $set: { quantity: 1 } }, { upsert: true });
    return checkout(customer, {
      addressId: addresses[customer],
      slotId: slot,
      idempotencyKey: randomUUID(),
      method,
      ...(forId === undefined ? {} : { forId }),
    });
  };
  const open = async (limitPaise: number) => {
    await tab.requestTab(parent);
    await tab.decideTab(boss, { familyId: home, decision: "approve", limitPaise });
  };
  const owed = async () => (await tabBalance(home)).owedPaise;
  const pay = (amountPaise: number, idempotencyKey = randomUUID()) =>
    tab.recordTabPayment(admin, { familyId: home, amountPaise, method: "cash", idempotencyKey });

  it("is opened, limited, paused and closed by the store owner only, audited, with the family told", async () => {
    await expect(tab.requestTab(partner)).rejects.toThrow("Only the family’s owner");
    await tab.requestTab(parent);
    await expect(tab.requestTab(parent)).rejects.toThrow("no open tab");
    await expect(tab.decideTab(admin, { familyId: home, decision: "approve", limitPaise: 25000 })).rejects.toThrow("FORBIDDEN");
    await expect(tab.decideTab(boss, { familyId: home, decision: "approve" })).rejects.toThrow("Set the tab limit");
    await expect(tab.decideTab(boss, { familyId: home, decision: "approve", limitPaise: 20_000_000 })).rejects.toThrow("₹1,00,000");
    await tab.decideTab(boss, { familyId: home, decision: "approve", limitPaise: 25000 });
    await expect(tab.decideTab(boss, { familyId: home, decision: "approve", limitPaise: 25000 })).rejects.toThrow("already changed");
    await tab.decideTab(boss, { familyId: home, decision: "pause" });
    await tab.decideTab(boss, { familyId: home, decision: "resume" });
    await tab.decideTab(boss, { familyId: home, decision: "limit", limitPaise: 30000 });
    await tab.decideTab(boss, { familyId: home, decision: "close" });
    expect((await Family.findById(home)).tab).toMatchObject({ status: "closed", limitPaise: 30000 });
    expect((await AuditLog.find({ target: home }).sort({ at: 1 })).map((a) => a.action)).toEqual([
      "tab.request",
      "tab.approve",
      "tab.pause",
      "tab.resume",
      "tab.limit",
      "tab.close",
    ]);
    expect(await Notification.countDocuments({ userId: partner, title: "Your family tab is open" })).toBe(1);
    await tab.requestTab(parent); // a closed tab can be asked for again
  });

  it("takes orders within the limit and refuses over it, paused, private, or without a tab", async () => {
    await expect(buy(parent)).rejects.toThrow("not open");
    await open(25000);
    const first = await Order.findById(await buy(partner));
    expect(first).toMatchObject({ paymentMethod: "tab", paymentStatus: "pending" });
    expect(String(first.familyId)).toBe(home);
    expect(await Notification.exists({ userId: parent, title: "Rohan put ₹100 on the family tab" })).toBeTruthy();
    await buy(parent);
    await expect(buy(parent)).rejects.toThrow("over your family tab limit. ₹50 is available.");
    await expect(buy(parent, "tab", "private")).rejects.toThrow("private order");
    await expect(buy(stranger)).rejects.toThrow("not open");
    await tab.decideTab(boss, { familyId: home, decision: "pause" });
    await pay(10000);
    await expect(buy(parent)).rejects.toThrow("not open");
    expect(await owed()).toBe(10000);
    expect(await Order.countDocuments({ paymentMethod: "tab" })).toBe(2);
  });

  it("lets only one of two adults checking out at once take the last of the limit", async () => {
    await open(15000);
    const results = await Promise.allSettled([buy(parent), buy(partner)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await owed()).toBe(10000);
  });

  it("serialises charges on the family document by itself", async () => {
    await open(15000);
    const charge = (customer: string) =>
      mongoose.connection.transaction(async (session) => {
        await chargeTab(customer, 10000, session);
        await Order.create(
          [
            {
              customerId: customer,
              number: `AGS-${randomUUID()}`,
              idempotencyKey: randomUUID(),
              items: [{ variantId: variant, name: "Tab Notebook", label: "1 pc", quantity: 1, pricePaise: 10000, linePaise: 10000 }],
              slotId: slot,
              paymentMethod: "tab",
              totalPaise: 10000,
              familyId: home,
            },
          ],
          { session },
        );
      });
    const results = await Promise.allSettled([charge(parent), charge(partner)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await Order.countDocuments({ paymentMethod: "tab" })).toBe(1);
  });

  it("counts last month's unpaid charges as overdue after the 10th, until they are paid", async () => {
    await open(50000);
    const order = await Order.findById(await buy(parent));
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date("2026-08-20T06:00:00Z") } });
    expect(await tabBalance(home, new Date("2026-09-05T06:00:00Z"))).toMatchObject({ duePaise: 10000, overdue: false });
    expect(await tabBalance(home, new Date("2026-09-11T06:00:00Z"))).toMatchObject({ duePaise: 10000, overdue: true });
    expect(await tabBalance(home, new Date("2026-08-25T06:00:00Z"))).toMatchObject({ duePaise: 0, overdue: false });
    await pay(4000);
    expect(await tabBalance(home, new Date("2026-09-11T06:00:00Z"))).toMatchObject({ duePaise: 6000, overdue: true });
    await pay(6000);
    expect(await tabBalance(home, new Date("2026-09-11T06:00:00Z"))).toMatchObject({ owedPaise: 0, overdue: false });
  });

  it("delivers a tab order without collecting cash and marks it charged", async () => {
    await open(25000);
    const orderId = await buy(parent);
    await changeOrderStatus(admin, { orderId, dimension: "order", next: "confirmed" });
    await changeOrderStatus(admin, { orderId, dimension: "fulfilment", next: "picking" });
    await savePacking(admin, { orderId, items: [{ variantId: variant, packedQuantity: 1, missing: false }] });
    await changeOrderStatus(admin, { orderId, dimension: "fulfilment", next: "packed" });
    await changeOrderStatus(admin, { orderId, dimension: "fulfilment", next: "ready" });
    await assignDelivery(admin, { orderId, partnerId: rider });
    await partnerTransition(rider, { orderId, next: "out-for-delivery" });
    await requestDeliveryOTP(parent, orderId);
    await expect(completeDelivery(rider, { orderId, code: "246810", cashPaise: 10000 })).rejects.toThrow("amount due");
    await completeDelivery(rider, { orderId, code: "246810", cashPaise: 0 });
    expect(await Order.findById(orderId)).toMatchObject({ deliveryStatus: "delivered", paymentStatus: "paid", codStatus: "uncollected" });
    expect(await CODCollection.countDocuments()).toBe(0);
    expect(await owed()).toBe(10000);
  });

  it("moves what is owed with cancellations, tab refunds, payments and voids, and never twice", async () => {
    await open(50000);
    const [a, b] = [await buy(parent), await buy(partner)];
    expect(await owed()).toBe(20000);
    await cancelOrder(parent, a);
    expect(await owed()).toBe(10000);
    await Order.updateOne({ _id: b }, { $set: { paymentStatus: "paid", deliveryStatus: "delivered" } });
    const refundId = await createRefund(boss, { orderId: b, amountPaise: 3000, reason: "One notebook was torn" });
    expect((await Refund.findById(refundId)).mode).toBe("tab");
    await processRefund(boss, { refundId });
    expect(await owed()).toBe(7000);
    expect(await Notification.exists({ userId: partner, body: /taken off your family tab/ })).toBeTruthy();
    const key = randomUUID();
    expect(await pay(5000, key)).toBe(2000);
    await pay(5000, key); // the same form sent twice
    expect(await owed()).toBe(2000);
    await expect(pay(9000)).rejects.toThrow("more than the family owes");
    await expect(
      tab.recordTabPayment(admin, { familyId: home, amountPaise: 1000, method: "upi", reference: "", idempotencyKey: randomUUID() }),
    ).rejects.toThrow("UPI reference");
    await expect(tab.recordTabPayment(stranger, { familyId: home, amountPaise: 1000, method: "cash", idempotencyKey: randomUUID() })).rejects.toThrow(
      "FORBIDDEN",
    );
    const payment = String((await TabPayment.findOne({ idempotencyKey: key }))!._id);
    await expect(tab.voidTabPayment(admin, { paymentId: payment, reason: "Wrong family" })).rejects.toThrow("FORBIDDEN");
    await tab.voidTabPayment(boss, { paymentId: payment, reason: "Wrong family" });
    await expect(tab.voidTabPayment(boss, { paymentId: payment, reason: "Wrong family" })).rejects.toThrow("already voided");
    expect(await owed()).toBe(7000);
  });

  it("sends one statement a month to each adult, however often it runs", async () => {
    await open(50000);
    const order = await Order.findById(await buy(parent));
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date("2026-08-20T06:00:00Z") } });
    const first = new Date("2026-09-01T00:30:00Z"); // 06:00 on the 1st in India
    expect(await tab.sendTabStatements(first)).toBe(1);
    expect(await tab.sendTabStatements(first)).toBe(0);
    const statements = await Notification.find({ title: /^Your August tab/ });
    expect(statements.map((n) => String(n.userId)).sort()).toEqual([parent, partner].sort());
    expect(statements[0]).toMatchObject({ title: "Your August tab: ₹100 added", body: "₹100 owed in all. Please pay by 10 September at the store or to the rider." });
  });
});
