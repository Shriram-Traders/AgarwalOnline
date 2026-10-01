import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  User,
  InventoryItem,
  AuditLog,
  OTPChallenge,
  Product,
  ProductVariant,
} from "../src/lib/db/models";
import {
  Order,
  CartLine,
  DeliverySlot,
  InventoryReservation,
  InventoryMovement,
  OrderTimelineEvent,
} from "../src/lib/commerce/models";
import { PackingChecklist, CODCollection } from "../src/lib/operations/models";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { Payment, Refund } from "../src/lib/payments/models";
import { Notification } from "../src/lib/engagement/models";
import {
  changeOrderStatus,
  savePacking,
  assignDelivery,
  partnerTransition,
  requestDeliveryOTP,
  completeDelivery,
} from "../src/lib/operations/service";
import { reorder } from "../src/lib/commerce/service";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Packing what the shop actually has", () => {
  let customer: string,
    admin: string,
    rider: string,
    owner: string,
    slotId: string,
    notebook: string,
    pen: string,
    glue: string;
  let serial = 0;

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
    for (const model of [
      User,
      InventoryItem,
      AuditLog,
      OTPChallenge,
      Product,
      ProductVariant,
      Order,
      CartLine,
      DeliverySlot,
      InventoryReservation,
      InventoryMovement,
      OrderTimelineEvent,
      PackingChecklist,
      CODCollection,
      Promotion,
      PromotionRedemption,
      Payment,
      Refund,
      Notification,
    ])
      await model.init();
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    serial = 0;
    const users = await User.create([
      { phone: "9000000281", name: "Customer", roles: ["customer"] },
      { phone: "9000000282", name: "Packer", roles: ["customer", "admin"] },
      { phone: "9000000283", name: "Ramesh", roles: ["customer", "delivery"] },
      { phone: "9000000284", name: "Owner", roles: ["customer", "super-admin"] },
      // a paused owner account is never sent work
      { phone: "9000000285", name: "Old owner", roles: ["customer", "super-admin"], active: false },
    ]);
    [customer, admin, rider, owner] = users.map((u: { _id: unknown }) => String(u._id));
    const slot = await DeliverySlot.create({
      areaId: new mongoose.Types.ObjectId(),
      date: "2099-01-01",
      label: "4–7 PM",
      capacity: 10,
      reserved: 1,
    });
    slotId = String(slot._id);
    [notebook, pen, glue] = [1, 2, 3].map(() => String(new mongoose.Types.ObjectId()));
    // 3 of each are set aside for other customers, so freeing too much (or too little) would show
    await InventoryItem.create(
      [notebook, pen, glue].map((variantId) => ({ variantId, onHand: 20, reserved: 3 })),
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  type Offer = {
    discountType: "fixed" | "percentage";
    discountValue: number;
    maximumDiscountPaise?: number;
  };
  /**
   * A confirmed order being picked: 3 notebooks at ₹60, 2 gel pens at ₹20 and a glue stick at ₹30
   * (₹250), ₹20 delivery, its stock set aside, and an offer if asked for. `keepTerms` stores the
   * offer's terms on the order as checkout does now; without it, it is an order from before.
   */
  async function order({
    offer,
    keepTerms = false,
    ...state
  }: { offer?: Offer; keepTerms?: boolean } & Record<string, unknown> = {}) {
    serial++;
    let discount = 0;
    const promotion = offer
      ? await Promotion.create({
          name: `Offer ${serial}`,
          kind: "automatic",
          ...offer,
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000),
          active: true,
          createdBy: admin,
          updatedBy: admin,
        })
      : null;
    if (offer) {
      discount =
        offer.discountType === "fixed"
          ? offer.discountValue
          : Math.floor((25000 * offer.discountValue) / 100);
      if (offer.maximumDiscountPaise) discount = Math.min(discount, offer.maximumDiscountPaise);
    }
    const created = await Order.create({
      customerId: customer,
      number: `AGS-PACK-${serial}`,
      idempotencyKey: `packing-${serial}`,
      items: [
        { variantId: notebook, name: "Notebook", label: "Single ruled", quantity: 3, pricePaise: 6000, linePaise: 18000 },
        { variantId: pen, name: "Gel pen", label: "Blue", quantity: 2, pricePaise: 2000, linePaise: 4000 },
        { variantId: glue, name: "Glue stick", label: "15 g", quantity: 1, pricePaise: 3000, linePaise: 3000 },
      ],
      address: { name: "Customer", phone: "9000000281" },
      slotId,
      deliveryDate: "2099-01-01",
      deliveryWindow: "4–7 PM",
      subtotalPaise: 25000,
      promotionDiscountPaise: discount,
      ...(promotion
        ? {
            appliedPromotion: {
              promotionId: promotion._id,
              name: promotion.name,
              discountPaise: discount,
              ...(keepTerms ? offer : {}),
            },
          }
        : {}),
      deliveryPaise: 2000,
      totalPaise: 25000 - discount + 2000,
      paymentMethod: "cod",
      orderStatus: "confirmed",
      fulfilmentStatus: "picking",
      ...state,
    });
    const id = String(created._id);
    await InventoryReservation.create([
      { orderId: id, variantId: notebook, quantity: 3 },
      { orderId: id, variantId: pen, quantity: 2 },
      { orderId: id, variantId: glue, quantity: 1 },
    ]);
    for (const [variantId, quantity] of [[notebook, 3], [pen, 2], [glue, 1]] as const)
      await InventoryItem.updateOne({ variantId }, { $inc: { reserved: quantity } });
    if (promotion)
      await PromotionRedemption.create({
        promotionId: promotion._id,
        customerId: customer,
        orderId: id,
        discountPaise: discount,
      });
    return id;
  }
  const line = (
    variantId: string,
    packedQuantity: number,
    rest: { missing?: boolean; substitution?: string; substituteQuantity?: number } = {},
  ) => ({
    variantId,
    packedQuantity,
    missing: rest.missing ?? false,
    substitution: rest.substitution,
    substituteQuantity: rest.substituteQuantity,
  });
  /** The customer's messages, oldest first, by title. */
  const customerTitles = async () =>
    (await Notification.find({ userId: customer }).sort({ _id: 1 }).lean()).map(
      (n: { title: string }) => n.title,
    );
  const reserved = async () =>
    Promise.all(
      [notebook, pen, glue].map(async (variantId) => (await InventoryItem.findOne({ variantId })).reserved),
    );
  const onHand = async () =>
    Promise.all(
      [notebook, pen, glue].map(async (variantId) => (await InventoryItem.findOne({ variantId })).onHand),
    );
  async function sendOut(orderId: string) {
    await changeOrderStatus(admin, { orderId, dimension: "fulfilment", next: "packed" });
    await changeOrderStatus(admin, { orderId, dimension: "fulfilment", next: "ready" });
    await assignDelivery(admin, { orderId, partnerId: rider });
    await partnerTransition(rider, { orderId, next: "out-for-delivery" });
    await requestDeliveryOTP(customer, orderId);
  }

  it("takes what wasn't there off a cash bill, works the offer out again, frees the stock and tells the customer", async () => {
    // ₹250 − 10% (₹25) + ₹20 delivery = ₹245
    const id = await order({ offer: { discountType: "percentage", discountValue: 10 } });
    const result = await savePacking(admin, {
      orderId: id,
      items: [
        line(notebook, 2, { missing: true }),
        line(pen, 1, { substitution: "Reynolds pen" }),
        line(glue, 0, { missing: true }),
      ],
    });
    expect(result).toMatchObject({
      complete: true,
      changed: true,
      charged: true,
      totalPaise: 16400,
      originalTotalPaise: 24500,
    });

    const packed = await Order.findById(id).lean();
    expect(packed.items).toEqual([
      expect.objectContaining({ quantity: 2, linePaise: 12000, orderedQuantity: 3, unavailableQuantity: 1 }),
      // the substitute is charged at the gel pen's price
      expect.objectContaining({
        quantity: 2,
        linePaise: 4000,
        orderedQuantity: 2,
        substituteName: "Reynolds pen",
        substituteQuantity: 1,
      }),
      expect.objectContaining({ quantity: 0, linePaise: 0, orderedQuantity: 1, unavailableQuantity: 1 }),
    ]);
    // ₹160 packed − 10% (₹16) + the same ₹20 delivery = ₹164
    expect([
      packed.subtotalPaise,
      packed.promotionDiscountPaise,
      packed.deliveryPaise,
      packed.totalPaise,
      packed.originalTotalPaise,
    ]).toEqual([16000, 1600, 2000, 16400, 24500]);
    // the offer as given at checkout stays on record
    expect(packed.appliedPromotion.discountPaise).toBe(2500);

    // stock stays set aside only for what went in: 2 notebooks, 1 gel pen (the other is a Reynolds), no glue
    expect(await reserved()).toEqual([5, 4, 3]);
    const held = await InventoryReservation.find({ orderId: id }).lean();
    expect(
      [notebook, pen, glue].map((v) => {
        const r = held.find((h) => String(h.variantId) === v)!;
        return [r.status, r.quantity];
      }),
    ).toEqual([
      ["active", 2],
      ["active", 1],
      ["released", 1],
    ]);
    expect(
      await InventoryMovement.countDocuments({ orderId: id, kind: "release", actorId: admin, quantity: 1 }),
    ).toBe(3);

    const note = await Notification.findOne({ userId: customer }).lean();
    expect(note).toMatchObject({
      type: "order",
      title: "Some items weren’t available",
      href: `/account/orders/${id}`,
    });
    expect(note?.body).toBe(
      "AGS-PACK-1: Not available – not charged: 1 × Notebook (Single ruled), 1 × Glue stick (15 g). Substituted at the same price: Reynolds pen for 1 × Gel pen (Blue). Your new total is ₹164 (was ₹245), to pay in cash on delivery.",
    );
    expect(
      (await AuditLog.findOne({ action: "packing.adjust", target: id }).lean())?.details,
    ).toMatchObject({ billChanged: true, totalBefore: 24500, totalAfter: 16400 });

    // the rider collects the new total, and only what went in is sold
    await sendOut(id);
    await expect(
      completeDelivery(rider, { orderId: id, code: "246810", cashPaise: 24500 }),
    ).rejects.toThrow("must match");
    await completeDelivery(rider, { orderId: id, code: "246810", cashPaise: 16400 });
    expect((await CODCollection.findOne({ orderId: id })).expectedPaise).toBe(16400);
    expect(await onHand()).toEqual([18, 19, 20]);
    expect(await reserved()).toEqual([3, 3, 3]);
  });

  it("keeps a fixed saving whole, but never past the smaller bill", async () => {
    // ₹250 − ₹50 + ₹20 = ₹220
    const id = await order({ offer: { discountType: "fixed", discountValue: 5000 } });
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 0, { missing: true }), line(pen, 2), line(glue, 1)],
    });
    // ₹70 packed − ₹50 + ₹20: the shop's shortfall, so the offer stays although ₹70 is under ₹250
    let packed = await Order.findById(id);
    expect([
      packed.subtotalPaise,
      packed.promotionDiscountPaise,
      packed.totalPaise,
      packed.originalTotalPaise,
    ]).toEqual([7000, 5000, 4000, 22000]);
    // then the pens aren't there either: ₹30 left, and the ₹50 saving stops at ₹30
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 0, { missing: true }), line(pen, 0, { missing: true }), line(glue, 1)],
    });
    packed = await Order.findById(id);
    expect([
      packed.subtotalPaise,
      packed.promotionDiscountPaise,
      packed.totalPaise,
      packed.originalTotalPaise,
    ]).toEqual([3000, 3000, 2000, 22000]);
    expect(await reserved()).toEqual([3, 3, 4]);
  });

  it("never touches the bill or the payment of an order paid online, but still records the shortfall and tells the customer", async () => {
    const id = await order({
      offer: { discountType: "percentage", discountValue: 10 },
      paymentMethod: "razorpay",
      paymentStatus: "paid",
    });
    await Payment.create({
      orderId: id,
      providerOrderId: "order_pack_1",
      providerPaymentId: "pay_pack_1",
      amountPaise: 24500,
      state: "paid",
    });
    const result = await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 0, { missing: true })],
    });
    // what was packed would have come to ₹164 (₹160 − 10% + ₹20): ₹81 less than the ₹245 paid
    expect(result).toMatchObject({
      complete: true,
      changed: true,
      charged: false,
      totalPaise: 24500,
      shortfallPaise: 8100,
      ownersTold: 1,
    });
    // only the owner can refund it, so the owner hears (a paused owner account doesn't)
    const owed = await Notification.find({ userId: { $ne: customer } }).lean();
    expect(owed).toHaveLength(1);
    expect(String(owed[0].userId)).toBe(owner);
    expect(owed[0]).toMatchObject({
      type: "refund",
      title: "AGS-PACK-1: ₹81 to refund",
      body: "AGS-PACK-1 was paid online, and ₹81 of it is for items that weren’t packed: 1 × Notebook (Single ruled), 1 × Glue stick (15 g). The customer was told the store will refund it: make the refund from the Refunds page.",
      href: `/super-admin/refunds?order=${id}`,
    });

    const packed = await Order.findById(id).lean();
    expect([
      packed.subtotalPaise,
      packed.promotionDiscountPaise,
      packed.totalPaise,
      packed.paymentStatus,
    ]).toEqual([25000, 2500, 24500, "paid"]);
    expect(packed.items.map((i: { quantity: number; linePaise: number }) => [i.quantity, i.linePaise])).toEqual([
      [3, 18000],
      [2, 4000],
      [1, 3000],
    ]);
    expect(packed.originalTotalPaise).toBeUndefined();
    expect(packed.shortfallPaise).toBe(8100);
    expect(
      packed.items.map((i: { unavailableQuantity?: number }) => i.unavailableQuantity ?? 0),
    ).toEqual([1, 0, 1]);
    expect(await Payment.findOne({ orderId: id }).lean()).toMatchObject({
      amountPaise: 24500,
      state: "paid",
      refundedPaise: 0,
      refundNeeded: false,
    });
    expect(await Refund.countDocuments()).toBe(0);
    // the units that didn't go in go back on sale all the same
    expect(await reserved()).toEqual([5, 5, 3]);
    const note = await Notification.findOne({ userId: customer }).lean();
    expect(note?.body).toBe(
      "AGS-PACK-1: Not available: 1 × Notebook (Single ruled), 1 × Glue stick (15 g). You paid online, so the store will arrange a refund of ₹81 for what wasn’t available.",
    );
    expect(
      (await AuditLog.findOne({ action: "packing.adjust", target: id }).lean())?.details,
    ).toMatchObject({ billChanged: false, totalBefore: 24500, totalAfter: 24500, shortfallPaise: 8100 });

    // a part refund made from the Refunds page doesn't hold the order up
    await Order.updateOne({ _id: id }, { $set: { paymentStatus: "partially-refunded" } });
    await sendOut(id);
    await completeDelivery(rider, { orderId: id, code: "246810", cashPaise: 0 });
    expect(await onHand()).toEqual([18, 18, 20]);
    expect((await Order.findById(id)).totalPaise).toBe(24500);
  });

  it("changes nothing when the same checklist is saved again, and puts an item found after all back on the bill", async () => {
    // ₹250 + ₹20
    const id = await order();
    const checklist = {
      orderId: id,
      items: [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 1)],
    };
    await savePacking(admin, checklist);
    expect(await savePacking(admin, checklist)).toMatchObject({
      complete: true,
      changed: false,
      totalPaise: 21000,
      originalTotalPaise: 27000,
    });
    expect(await Notification.countDocuments({ userId: customer })).toBe(1);
    expect(await InventoryMovement.countDocuments({ orderId: id })).toBe(1);
    expect(await reserved()).toEqual([5, 5, 4]);

    // the third notebook turns up: set aside again, and the bill is as ordered
    const found = await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 3), line(pen, 2), line(glue, 1)],
    });
    expect(found).toMatchObject({ changed: true, totalPaise: 27000 });
    const back = await Order.findById(id).lean();
    expect(back.items[0]).toMatchObject({ quantity: 3, linePaise: 18000 });
    expect(back.items[0].orderedQuantity).toBeUndefined();
    expect(back.items[0].unavailableQuantity).toBeUndefined();
    expect([back.subtotalPaise, back.totalPaise, back.originalTotalPaise]).toEqual([25000, 27000, undefined]);
    expect(await reserved()).toEqual([6, 5, 4]);
    expect(
      (await InventoryReservation.findOne({ orderId: id, variantId: notebook }).lean())?.quantity,
    ).toBe(3);
    expect(
      await InventoryMovement.countDocuments({ orderId: id, variantId: notebook, kind: "reserve" }),
    ).toBe(1);
    const latest = await Notification.findOne({ userId: customer }).sort({ _id: -1 }).lean();
    expect(latest).toMatchObject({
      title: "Your order is packed in full",
      body: "AGS-PACK-1: everything you ordered is packed after all. Your total is back to ₹270.",
    });
  });

  it("won't set stock aside again once it has gone to someone else", async () => {
    const id = await order();
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 1, { missing: true }), line(pen, 2), line(glue, 1)],
    });
    // the 2 notebooks freed go to other customers, with every other free one
    await InventoryItem.updateOne({ variantId: notebook }, { $set: { reserved: 20 } });
    await expect(
      savePacking(admin, { orderId: id, items: [line(notebook, 3), line(pen, 2), line(glue, 1)] }),
    ).rejects.toThrow("Packed quantity for Notebook (Single ruled) can’t go back up to 3");
    const unchanged = await Order.findById(id);
    expect([unchanged.items[0].quantity, unchanged.totalPaise]).toEqual([1, 15000]);
  });

  it("waits for a word about every short line, names it, and refuses a checklist that contradicts itself", async () => {
    const id = await order();
    await expect(
      savePacking(rider, { orderId: id, items: [line(notebook, 3), line(pen, 2), line(glue, 1)] }),
    ).rejects.toThrow("FORBIDDEN");

    const result = await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2), line(pen, 2), line(glue, 1)],
    });
    expect(result).toMatchObject({
      complete: false,
      changed: false,
      waiting: ["Notebook (Single ruled): 2 of 3 packed"],
    });
    // work in progress: the order and its stock are as they were, and the customer isn't told yet
    expect((await Order.findById(id)).totalPaise).toBe(27000);
    expect(await reserved()).toEqual([6, 5, 4]);
    expect(await Notification.countDocuments()).toBe(0);
    await expect(
      changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "packed" }),
    ).rejects.toThrow("Complete the packing checklist first: Notebook (Single ruled).");

    for (const [items, message] of [
      [[line(notebook, 3, { missing: true }), line(pen, 2), line(glue, 1)], /^Check Notebook \(Single ruled\): all 3/],
      [[line(notebook, 1, { missing: true, substitution: "Navneet" }), line(pen, 2), line(glue, 1)], /say how many Navneet went in/],
      [[line(notebook, 2, { substitution: "1 short" }), line(pen, 2), line(glue, 1)], /“1 short” isn’t a substitute/],
      [[line(notebook, 4), line(pen, 2), line(glue, 1)], /can’t be more than the 3 ordered/],
      [[line(notebook, 3), line(pen, 2)], /^Check every item exactly once/],
      [
        [line(notebook, 0, { missing: true }), line(pen, 0, { missing: true }), line(glue, 0, { missing: true })],
        /^Nothing is packed for this order/,
      ],
    ] as const)
      await expect(savePacking(admin, { orderId: id, items })).rejects.toThrow(message);

    // the "none left" tick is kept, so the checklist opens as it was saved
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 1)],
    });
    const saved = await PackingChecklist.findOne({ orderId: id }).lean();
    expect(saved?.completedAt).toBeInstanceOf(Date);
    expect(saved?.items[0]).toMatchObject({ packedQuantity: 2, missing: true });
    await changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "packed" });
    expect((await Order.findById(id)).fulfilmentStatus).toBe("packed");
  });

  it("orders again what the customer asked for, including what wasn't there", async () => {
    const id = await order();
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 3), line(pen, 2), line(glue, 0, { missing: true })],
    });
    const product = await Product.create({
      slug: "glue-stick",
      name: { en: "Glue stick", mr: "ग्लू स्टिक" },
      description: { en: "Washable glue", mr: "धुता येणारा ग्लू" },
      categoryId: new mongoose.Types.ObjectId(),
      categorySlug: "school",
      status: "published",
    });
    await ProductVariant.create({
      _id: glue,
      productId: product._id,
      sku: "GLUE-15",
      label: "15 g",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 3000,
      mrpPaise: 3000,
    });
    // the notebook and pen are no longer sold in this test; the glue stick is back
    expect(await reorder(customer, id)).toEqual({ added: 1, skipped: 2 });
    expect((await CartLine.findOne({ customerId: customer, variantId: glue }))?.quantity).toBe(1);
  });

  it("takes a line that was partly swapped and partly not there: charged for what went in, stock held for its own item", async () => {
    // ₹250 + ₹20
    const id = await order();
    // 3 notebooks: 1 on the shelf, a Navneet notebook in place of another, none for the third
    const result = await savePacking(admin, {
      orderId: id,
      items: [
        line(notebook, 1, { missing: true, substitution: "Navneet notebook", substituteQuantity: 1 }),
        line(pen, 2),
        line(glue, 1),
      ],
    });
    // ₹120 for the notebook and its substitute, ₹40 + ₹30 for the rest, and ₹20 delivery
    expect(result).toMatchObject({
      complete: true,
      changed: true,
      totalPaise: 21000,
      originalTotalPaise: 27000,
      recount: ["Notebook (Single ruled)"],
      substitutes: ["1 × Navneet notebook"],
    });
    const packed = await Order.findById(id).lean();
    expect(packed.items[0]).toMatchObject({
      quantity: 2,
      linePaise: 12000,
      orderedQuantity: 3,
      unavailableQuantity: 1,
      substituteName: "Navneet notebook",
      substituteQuantity: 1,
    });
    // only the one notebook of its own kind stays set aside
    expect(await reserved()).toEqual([4, 5, 4]);
    expect((await Notification.findOne({ userId: customer }).lean())?.body).toBe(
      "AGS-PACK-1: Not available – not charged: 1 × Notebook (Single ruled). Substituted at the same price: Navneet notebook for 1 × Notebook (Single ruled). Your new total is ₹210 (was ₹270), to pay in cash on delivery.",
    );
    // the checklist opens again with the count it was saved with
    expect((await PackingChecklist.findOne({ orderId: id }).lean())?.items[0]).toMatchObject({
      packedQuantity: 1,
      missing: true,
      substitution: "Navneet notebook",
      substituteQuantity: 1,
    });
    await sendOut(id);
    await completeDelivery(rider, { orderId: id, code: "246810", cashPaise: 21000 });
    expect(await onHand()).toEqual([19, 18, 19]);
  });

  it("tells the owners when what is owed changes, but not whoever packed it", async () => {
    // ₹250 + ₹20, paid online
    const id = await order({ paymentMethod: "razorpay", paymentStatus: "paid" });
    const ownerMessages = async () =>
      (await Notification.find({ userId: owner }).sort({ _id: 1 }).lean()).map(
        (n: { title: string; href: string }) => [n.title, n.href],
      );
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 1)],
    });
    // saved again as it was: nothing new is owed, so no second message
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 1)],
    });
    // the third notebook turns up after all
    await savePacking(admin, { orderId: id, items: [line(notebook, 3), line(pen, 2), line(glue, 1)] });
    expect(await ownerMessages()).toEqual([
      ["AGS-PACK-1: ₹60 to refund", `/super-admin/refunds?order=${id}`],
      ["AGS-PACK-1: no refund owed after all", `/admin/orders/${id}`],
    ]);
    // the owner packing it themselves knows already
    const theirs = await savePacking(owner, {
      orderId: id,
      items: [line(notebook, 3), line(pen, 2), line(glue, 0, { missing: true })],
    });
    expect(theirs).toMatchObject({ shortfallPaise: 3000, ownersTold: 0 });
    expect(await ownerMessages()).toHaveLength(2);
    // no payment record was touched along the way
    expect(await Refund.countDocuments()).toBe(0);
    expect((await Order.findById(id)).paymentStatus).toBe("paid");
  });

  it("asks for one more save when a checklist was finished before orders followed their packing", async () => {
    // ₹250 + ₹20
    const id = await order();
    // under the old rules a short line with a note in the substitution box counted as finished,
    // and the order, its stock and the customer were left as they were
    await PackingChecklist.create({
      orderId: id,
      packerId: admin,
      completedAt: new Date(),
      items: [
        { variantId: notebook, packedQuantity: 2, missing: false, substitution: "Navneet notebook" },
        { variantId: pen, packedQuantity: 2, missing: false, substitution: "" },
        { variantId: glue, packedQuantity: 1, missing: false, substitution: "" },
      ],
    });
    await expect(
      changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "packed" }),
    ).rejects.toThrow(
      "Complete the packing checklist first: save it once more, so the order shows what was packed for Notebook (Single ruled).",
    );
    // saved again as it stands: the order follows it, the customer is told and the swapped notebook's stock is freed
    await savePacking(admin, {
      orderId: id,
      items: [line(notebook, 2, { substitution: "Navneet notebook" }), line(pen, 2), line(glue, 1)],
    });
    expect((await Order.findById(id).lean()).items[0]).toMatchObject({
      quantity: 3,
      substituteName: "Navneet notebook",
      substituteQuantity: 1,
    });
    expect(await reserved()).toEqual([5, 5, 4]);
    expect(await customerTitles()).toEqual(["An item in your order was swapped"]);
    await changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "packed" });

    // a note that names nothing has to be cleared first
    const other = await order();
    await PackingChecklist.create({
      orderId: other,
      packerId: admin,
      completedAt: new Date(),
      items: [
        { variantId: notebook, packedQuantity: 2, missing: false, substitution: "1 short" },
        { variantId: pen, packedQuantity: 2, missing: false, substitution: "" },
        { variantId: glue, packedQuantity: 1, missing: false, substitution: "" },
      ],
    });
    await expect(
      changeOrderStatus(admin, { orderId: other, dimension: "fulfilment", next: "packed" }),
    ).rejects.toThrow("Complete the packing checklist first: Notebook (Single ruled).");
    await expect(
      savePacking(admin, {
        orderId: other,
        items: [line(notebook, 2, { substitution: "1 short" }), line(pen, 2), line(glue, 1)],
      }),
    ).rejects.toThrow(
      "Check Notebook (Single ruled): “1 short” isn’t a substitute. Tick “The rest isn’t available” instead, or name the product you packed.",
    );
    // nothing was charged for it
    expect((await Order.findById(other)).totalPaise).toBe(27000);
  });

  it("works the offer out on the terms it had at checkout, even after the owner edits it", async () => {
    // ₹250 − 10% (₹25) + ₹20 = ₹245, with the terms kept on the order as checkout keeps them
    const id = await order({ offer: { discountType: "percentage", discountValue: 10 }, keepTerms: true });
    const promotionOf = async (orderId: string) =>
      (await Order.findById(orderId)).appliedPromotion.promotionId;
    // the owner then turns the running offer into a fixed ₹100 off
    await Promotion.updateOne(
      { _id: await promotionOf(id) },
      { $set: { discountType: "fixed", discountValue: 10000 } },
    );
    const packing = [line(notebook, 2, { missing: true }), line(pen, 2), line(glue, 0, { missing: true })];
    await savePacking(admin, { orderId: id, items: packing });
    // ₹160 packed − 10% (₹16) + ₹20 = ₹164, as the customer was offered
    let packed = await Order.findById(id);
    expect([packed.promotionDiscountPaise, packed.totalPaise]).toEqual([1600, 16400]);

    // an order placed before the terms were kept reads the offer as it is now: lowered to 5%
    const older = await order({ offer: { discountType: "percentage", discountValue: 10 } });
    await Promotion.updateOne({ _id: await promotionOf(older) }, { $set: { discountValue: 5 } });
    await savePacking(admin, { orderId: older, items: packing });
    // ₹160 − 5% (₹8) + ₹20 = ₹172
    packed = await Order.findById(older);
    expect([packed.promotionDiscountPaise, packed.totalPaise]).toEqual([800, 17200]);
  });

  it("tells the customer when the order is confirmed and when it is completed, not at each packing step", async () => {
    const id = await order({ orderStatus: "placed", fulfilmentStatus: "unassigned" });
    await changeOrderStatus(admin, { orderId: id, dimension: "order", next: "confirmed" });
    await changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "picking" });
    await savePacking(admin, { orderId: id, items: [line(notebook, 3), line(pen, 2), line(glue, 1)] });
    await changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "packed" });
    await changeOrderStatus(admin, { orderId: id, dimension: "fulfilment", next: "ready" });
    // "Mark packed" used to say "Order completed" before the parcel had left the shop
    expect(await customerTitles()).toEqual(["Order confirmed"]);
    await assignDelivery(admin, { orderId: id, partnerId: rider });
    await partnerTransition(rider, { orderId: id, next: "out-for-delivery" });
    await requestDeliveryOTP(customer, id);
    await completeDelivery(rider, { orderId: id, code: "246810", cashPaise: 27000 });
    await changeOrderStatus(admin, { orderId: id, dimension: "order", next: "completed" });
    expect(await customerTitles()).toEqual([
      "Order confirmed",
      "Delivery partner assigned",
      "Your order is on the way",
      "Order delivered",
      "Order completed",
    ]);
  });
});
