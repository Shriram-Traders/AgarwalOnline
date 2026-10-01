import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User, InventoryItem, AuditLog } from "../src/lib/db/models";
import {
  Order,
  DeliverySlot,
  InventoryReservation,
  InventoryMovement,
  OrderTimelineEvent,
} from "../src/lib/commerce/models";
import { DeliveryAttempt, PackingChecklist } from "../src/lib/operations/models";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { Notification } from "../src/lib/engagement/models";
import {
  assignDelivery,
  partnerTransition,
  cancelByStore,
  retryDelivery,
  returnToShop,
  changeRider,
  removeRider,
} from "../src/lib/operations/service";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Store cancel, failed deliveries and rider changes", () => {
  let customer: string,
    admin: string,
    rider: string,
    otherRider: string,
    pausedRider: string,
    slotId: string,
    pens: string,
    glue: string,
    promotionId: string;
  let serial = 0;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const model of [
      User,
      InventoryItem,
      AuditLog,
      Order,
      DeliverySlot,
      InventoryReservation,
      InventoryMovement,
      OrderTimelineEvent,
      DeliveryAttempt,
      PackingChecklist,
      Promotion,
      PromotionRedemption,
      Notification,
    ])
      await model.init();
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    serial = 0;
    const users = await User.create([
      { phone: "9000000181", name: "Customer", roles: ["customer"] },
      { phone: "9000000182", name: "Admin", roles: ["customer", "admin"] },
      { phone: "9000000183", name: "Ramesh", roles: ["customer", "delivery"] },
      { phone: "9000000184", name: "Suresh", roles: ["customer", "delivery"] },
      { phone: "9000000185", name: "Paused rider", roles: ["customer", "delivery"], active: false },
    ]);
    [customer, admin, rider, otherRider, pausedRider] = users.map(
      (u: { _id: unknown }) => String(u._id),
    );
    // another order already holds one place in this slot, so a double release would show
    const slot = await DeliverySlot.create({
      areaId: new mongoose.Types.ObjectId(),
      date: "2099-01-01",
      label: "4–7 PM",
      capacity: 10,
      reserved: 1,
    });
    slotId = String(slot._id);
    pens = String(new mongoose.Types.ObjectId());
    glue = String(new mongoose.Types.ObjectId());
    // 3 of each are set aside for other customers' orders, again so a double release would show
    await InventoryItem.create([
      { variantId: pens, onHand: 20, reserved: 3 },
      { variantId: glue, onHand: 20, reserved: 3 },
    ]);
    const promotion = await Promotion.create({
      name: "Welcome",
      code: "HELLO10",
      kind: "code",
      discountType: "fixed",
      discountValue: 1000,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      perCustomerLimit: 1,
      redemptionCount: 4,
      active: true,
      createdBy: admin,
      updatedBy: admin,
    });
    promotionId = String(promotion._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  /** An order holding 2 pens and 1 glue stick, its slot place and (optionally) the offer. */
  async function order(state: Record<string, unknown> = {}, offer = false) {
    serial++;
    const created = await Order.create({
      customerId: customer,
      number: `AGS-TEST-${serial}`,
      idempotencyKey: `recovery-${serial}`,
      items: [
        { variantId: pens, name: "Gel pen", label: "Blue", quantity: 2, pricePaise: 2000, linePaise: 4000 },
        { variantId: glue, name: "Glue stick", label: "15 g", quantity: 1, pricePaise: 3000, linePaise: 3000 },
      ],
      address: { name: "Customer", phone: "9000000181" },
      slotId,
      deliveryDate: "2099-01-01",
      deliveryWindow: "4–7 PM",
      subtotalPaise: 7000,
      promotionDiscountPaise: offer ? 1000 : 0,
      deliveryPaise: 0,
      totalPaise: offer ? 6000 : 7000,
      paymentMethod: "cod",
      ...state,
    });
    const id = String(created._id);
    await InventoryReservation.create([
      { orderId: id, variantId: pens, quantity: 2 },
      { orderId: id, variantId: glue, quantity: 1 },
    ]);
    await InventoryItem.updateOne({ variantId: pens }, { $inc: { reserved: 2 } });
    await InventoryItem.updateOne({ variantId: glue }, { $inc: { reserved: 1 } });
    await DeliverySlot.updateOne({ _id: slotId }, { $inc: { reserved: 1 } });
    if (offer) {
      await PromotionRedemption.create({
        promotionId,
        customerId: customer,
        orderId: id,
        discountPaise: 1000,
      });
      await Promotion.updateOne({ _id: promotionId }, { $inc: { redemptionCount: 1 } });
    }
    return id;
  }
  const reserved = async (variantId: string) =>
    (await InventoryItem.findOne({ variantId })).reserved;
  const onHand = async (variantId: string) =>
    (await InventoryItem.findOne({ variantId })).onHand;
  const slotReserved = async () => (await DeliverySlot.findById(slotId)).reserved;
  const redemptions = async () =>
    (await Promotion.findById(promotionId)).redemptionCount;
  const ready = { orderStatus: "confirmed", fulfilmentStatus: "ready" };

  describe("Cancel order", () => {
    it("frees the stock, the slot and the offer exactly once, and tells the customer why", async () => {
      const id = await order({ orderStatus: "confirmed", fulfilmentStatus: "picking" }, true);
      expect([await reserved(pens), await reserved(glue), await slotReserved(), await redemptions()]).toEqual([5, 4, 2, 5]);

      // two staff tapping Cancel at the same moment: one wins, the other is told it's done
      const results = await Promise.allSettled([
        cancelByStore(admin, { orderId: id, reason: "Customer asked to cancel on the phone" }),
        cancelByStore(admin, { orderId: id, reason: "Customer asked to cancel on the phone" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      await expect(
        cancelByStore(admin, { orderId: id, reason: "Customer asked again" }),
      ).rejects.toThrow("already cancelled");

      const cancelled = await Order.findById(id);
      expect(cancelled.orderStatus).toBe("cancelled");
      expect([await reserved(pens), await reserved(glue)]).toEqual([3, 3]);
      expect([await onHand(pens), await onHand(glue)]).toEqual([20, 20]);
      expect(await slotReserved()).toBe(1);
      expect(await redemptions()).toBe(4);
      expect(await PromotionRedemption.countDocuments({ orderId: id })).toBe(0);
      expect(await InventoryReservation.countDocuments({ orderId: id, status: "released" })).toBe(2);
      expect(
        await InventoryMovement.countDocuments({ orderId: id, kind: "release", actorId: admin }),
      ).toBe(2);

      const event = await OrderTimelineEvent.findOne({ orderId: id, next: "cancelled" }).lean();
      expect(event).toMatchObject({
        dimension: "order",
        previous: "confirmed",
        notes: "Customer asked to cancel on the phone",
      });
      const audit = await AuditLog.findOne({ action: "order.cancel", target: id }).lean();
      expect(audit?.details).toMatchObject({
        reason: "Customer asked to cancel on the phone",
        unitsReleased: 3,
        offerReturned: true,
      });
      const note = await Notification.findOne({ userId: customer, title: "Order cancelled" });
      expect(note.body).toContain("Customer asked to cancel on the phone.");
      expect(note.body).toContain("Nothing is due.");
      // one message, to the customer only: no rider had it
      expect(await Notification.countDocuments()).toBe(1);
    });

    it("takes an assigned order off its rider, and tells the rider in case they have the parcel", async () => {
      const id = await order({ ...ready, deliveryStatus: "assigned", assignedTo: rider });
      await cancelByStore(admin, { orderId: id, reason: "Shop can't deliver today" });
      const cancelled = await Order.findById(id);
      expect(cancelled.deliveryStatus).toBe("unassigned");
      expect(cancelled.assignedTo).toBeUndefined();
      expect(
        await OrderTimelineEvent.exists({ orderId: id, dimension: "delivery", previous: "assigned", next: "unassigned" }),
      ).toBeTruthy();
      await expect(
        partnerTransition(rider, { orderId: id, next: "out-for-delivery" }),
      ).rejects.toThrow("not assigned to you");
      const told = await Notification.findOne({ userId: rider }).lean();
      expect(told).toMatchObject({
        type: "delivery",
        title: "AGS-TEST-1 is off your list",
        href: "/delivery",
      });
      expect(told?.body).toBe(
        "The store cancelled this order. If you have already collected the parcel, please bring it back to the shop.",
      );
    });

    it("is refused once the order has left the shop, and leaves its stock alone", async () => {
      const onTheRoad = await order({ ...ready, deliveryStatus: "out-for-delivery", assignedTo: rider });
      await expect(
        cancelByStore(admin, { orderId: onTheRoad, reason: "Customer changed their mind" }),
      ).rejects.toThrow("out for delivery");
      const delivered = await order({ ...ready, deliveryStatus: "delivered", assignedTo: rider });
      await expect(
        cancelByStore(admin, { orderId: delivered, reason: "Customer changed their mind" }),
      ).rejects.toThrow("delivered");
      const failed = await order({ ...ready, deliveryStatus: "failed", assignedTo: rider });
      await expect(
        cancelByStore(admin, { orderId: failed, reason: "Customer changed their mind" }),
      ).rejects.toThrow("Returned to shop");
      expect((await Order.findById(onTheRoad)).orderStatus).toBe("confirmed");
      expect([await reserved(pens), await slotReserved()]).toEqual([3 + 2 * 3, 1 + 3]);
    });

    it("is refused for an order paid online, and never touches the payment", async () => {
      const paid = await order({
        orderStatus: "confirmed",
        paymentMethod: "razorpay",
        paymentStatus: "paid",
      });
      await expect(
        cancelByStore(admin, { orderId: paid, reason: "Customer asked to cancel" }),
      ).rejects.toThrow("paid online");
      const partly = await order({
        orderStatus: "confirmed",
        paymentMethod: "razorpay",
        paymentStatus: "partially-refunded",
      });
      await expect(
        cancelByStore(admin, { orderId: partly, reason: "Customer asked to cancel" }),
      ).rejects.toThrow("Refunds page");
      const untouched = await Order.findById(paid);
      expect([untouched.orderStatus, untouched.paymentStatus]).toEqual(["confirmed", "paid"]);
      expect(await InventoryReservation.countDocuments({ orderId: paid, status: "active" })).toBe(2);
      expect(await slotReserved()).toBe(3);
      expect(await AuditLog.countDocuments({ action: "order.cancel" })).toBe(0);

      // not paid yet (the customer never finished paying): nothing to refund, so it can go
      const unpaid = await order({ paymentMethod: "razorpay", paymentStatus: "pending" });
      await cancelByStore(admin, { orderId: unpaid, reason: "Customer asked to cancel" });
      expect((await Order.findById(unpaid)).paymentStatus).toBe("pending");
      // refunded in full from the Refunds page: nothing left to pay back, so it can be closed
      const refunded = await order({
        orderStatus: "confirmed",
        paymentMethod: "razorpay",
        paymentStatus: "refunded",
      });
      await cancelByStore(admin, { orderId: refunded, reason: "Refunded, stock not coming" });
      expect((await Order.findById(refunded)).paymentStatus).toBe("refunded");
      expect(
        (await Notification.findOne({ userId: customer, body: /AGS-TEST-4/ })).body,
      ).toContain("refunded in full");
    });

    it("needs order permissions and a reason", async () => {
      const id = await order({ orderStatus: "confirmed" });
      await expect(
        cancelByStore(customer, { orderId: id, reason: "I want to cancel" }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        cancelByStore(rider, { orderId: id, reason: "I want to cancel" }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(cancelByStore(admin, { orderId: id, reason: " no " })).rejects.toThrow(
        "Enter the reason for cancelling",
      );
      expect((await Order.findById(id)).orderStatus).toBe("confirmed");
    });
  });

  describe("A delivery that didn't go through", () => {
    it("can be tried again, keeping its stock set aside, and given to a rider again", async () => {
      const id = await order(ready);
      await assignDelivery(admin, { orderId: id, partnerId: rider });
      await partnerTransition(rider, { orderId: id, next: "out-for-delivery" });
      await partnerTransition(rider, { orderId: id, next: "attempted", reason: "House locked" });
      await partnerTransition(rider, { orderId: id, next: "failed", reason: "Still locked after retry" });

      await retryDelivery(admin, { orderId: id });
      const back = await Order.findById(id);
      expect([back.orderStatus, back.deliveryStatus]).toEqual(["confirmed", "unassigned"]);
      expect(back.assignedTo).toBeUndefined();
      expect(await InventoryReservation.countDocuments({ orderId: id, status: "active" })).toBe(2);
      expect([await reserved(pens), await reserved(glue), await slotReserved()]).toEqual([5, 4, 2]);
      expect(
        await OrderTimelineEvent.exists({ orderId: id, previous: "failed", next: "unassigned" }),
      ).toBeTruthy();
      expect(await AuditLog.exists({ action: "delivery.retry", target: id })).toBeTruthy();
      expect(
        await Notification.exists({ userId: customer, title: "Your delivery will be tried again" }),
      ).toBeTruthy();
      // the rider closed it as failed themselves, so there is nothing new to tell them
      expect(await Notification.exists({ userId: rider })).toBeFalsy();

      await expect(retryDelivery(admin, { orderId: id })).rejects.toThrow("isn't waiting");
      await assignDelivery(admin, { orderId: id, partnerId: otherRider });
      expect(String((await Order.findById(id)).assignedTo)).toBe(otherRider);
    });

    it("can be tried again straight after a missed attempt, and the rider is asked to bring the parcel back", async () => {
      const id = await order({ ...ready, deliveryStatus: "attempted", assignedTo: rider });
      await expect(retryDelivery(rider, { orderId: id })).rejects.toThrow("FORBIDDEN");
      await retryDelivery(admin, { orderId: id });
      expect((await Order.findById(id)).deliveryStatus).toBe("unassigned");
      expect((await Notification.findOne({ userId: rider }))?.body).toBe(
        "The store will send it out again later. Please bring the parcel back to the shop.",
      );
      expect(
        await Notification.countDocuments({ userId: customer, title: "Your delivery will be tried again" }),
      ).toBe(1);
    });

    it("can be marked returned to shop: stock back on sale, order cancelled, offer given back", async () => {
      const id = await order({ ...ready, deliveryStatus: "failed", assignedTo: rider }, true);
      await returnToShop(admin, { orderId: id });
      await expect(returnToShop(admin, { orderId: id })).rejects.toThrow("already cancelled");

      const closed = await Order.findById(id);
      expect([closed.orderStatus, closed.deliveryStatus]).toEqual(["cancelled", "returned"]);
      // the rider stays on the record as the one who brought it back
      expect(String(closed.assignedTo)).toBe(rider);
      expect([await reserved(pens), await reserved(glue)]).toEqual([3, 3]);
      expect([await onHand(pens), await onHand(glue)]).toEqual([20, 20]);
      expect(
        await InventoryMovement.countDocuments({ orderId: id, kind: "release" }),
      ).toBe(2);
      expect(await redemptions()).toBe(4);
      // the delivery run in that slot already happened, so its place isn't handed back
      expect(await slotReserved()).toBe(2);
      expect(
        await OrderTimelineEvent.exists({ orderId: id, previous: "failed", next: "returned" }),
      ).toBeTruthy();
      expect(
        await OrderTimelineEvent.exists({ orderId: id, dimension: "order", next: "cancelled" }),
      ).toBeTruthy();
      expect(await AuditLog.exists({ action: "order.return-to-shop", target: id })).toBeTruthy();
      const note = await Notification.findOne({ userId: customer, title: "Order cancelled" });
      expect(note.body).toContain("couldn't be delivered");

      // and from a missed attempt, with the rider back at the shop
      const attempted = await order({ ...ready, deliveryStatus: "attempted", assignedTo: rider });
      await returnToShop(admin, { orderId: attempted });
      expect((await Order.findById(attempted)).deliveryStatus).toBe("returned");
    });

    it("is not closed from here when it was paid online, but can still be tried again", async () => {
      const id = await order({
        ...ready,
        deliveryStatus: "failed",
        assignedTo: rider,
        paymentMethod: "razorpay",
        paymentStatus: "paid",
      });
      await expect(returnToShop(admin, { orderId: id })).rejects.toThrow("paid online");
      expect(await InventoryReservation.countDocuments({ orderId: id, status: "active" })).toBe(2);
      await retryDelivery(admin, { orderId: id });
      const retried = await Order.findById(id);
      expect([retried.deliveryStatus, retried.paymentStatus]).toEqual(["unassigned", "paid"]);
    });

    it("waits for a real failure: an order still on its way can't be returned or retried", async () => {
      const id = await order({ ...ready, deliveryStatus: "out-for-delivery", assignedTo: rider });
      await expect(returnToShop(admin, { orderId: id })).rejects.toThrow("isn't waiting");
      await expect(retryDelivery(admin, { orderId: id })).rejects.toThrow("isn't waiting");
    });
  });

  describe("Change or remove the rider", () => {
    it("hands an order to another active rider before the delivery starts", async () => {
      const id = await order({ ...ready, deliveryStatus: "assigned", assignedTo: rider });
      await expect(
        changeRider(admin, { orderId: id, partnerId: pausedRider }),
      ).rejects.toThrow("active delivery partner");
      await expect(
        changeRider(admin, { orderId: id, partnerId: customer }),
      ).rejects.toThrow("active delivery partner");
      await expect(
        changeRider(admin, { orderId: id, partnerId: rider }),
      ).rejects.toThrow("different delivery partner");
      await expect(
        changeRider(rider, { orderId: id, partnerId: otherRider }),
      ).rejects.toThrow("FORBIDDEN");

      await changeRider(admin, { orderId: id, partnerId: otherRider });
      const moved = await Order.findById(id);
      expect([String(moved.assignedTo), moved.deliveryStatus]).toEqual([otherRider, "assigned"]);
      expect(
        (await OrderTimelineEvent.findOne({ orderId: id, dimension: "delivery" })).notes,
      ).toBe("Rider changed from Ramesh to Suresh");
      expect(
        (await AuditLog.findOne({ action: "delivery.reassign", target: id }).lean())?.details,
      ).toMatchObject({ from: rider, to: otherRider, previous: "assigned" });
      await expect(
        partnerTransition(rider, { orderId: id, next: "out-for-delivery" }),
      ).rejects.toThrow("not assigned to you");
      // the first rider is told it's gone; the customer's delivery hasn't changed for them
      expect((await Notification.findOne({ userId: rider }))?.body).toBe(
        "The store gave it to Suresh. If you have already collected the parcel, please bring it back to the shop.",
      );
      expect(await Notification.exists({ userId: customer })).toBeFalsy();
      await partnerTransition(otherRider, { orderId: id, next: "out-for-delivery" });
      // once it's on the road the rider can't be swapped
      await expect(
        changeRider(admin, { orderId: id, partnerId: rider }),
      ).rejects.toThrow("out for delivery");
      await expect(removeRider(admin, { orderId: id })).rejects.toThrow("out for delivery");
    });

    it("gives a missed delivery to a new rider, who starts from the beginning", async () => {
      const id = await order({ ...ready, deliveryStatus: "attempted", assignedTo: rider });
      await changeRider(admin, { orderId: id, partnerId: otherRider });
      const moved = await Order.findById(id);
      expect([String(moved.assignedTo), moved.deliveryStatus]).toEqual([otherRider, "assigned"]);
      expect(await InventoryReservation.countDocuments({ orderId: id, status: "active" })).toBe(2);
      // the same words as Try again, for the same outcome
      expect(
        await Notification.exists({ userId: customer, title: "Your delivery will be tried again" }),
      ).toBeTruthy();
      expect((await Notification.findOne({ userId: rider }))?.body).toBe(
        "The store gave it to Suresh. Please bring the parcel back to the shop.",
      );
    });

    it("takes the order off its rider, back to Packed, no rider", async () => {
      const id = await order({ ...ready, deliveryStatus: "assigned", assignedTo: rider });
      await removeRider(admin, { orderId: id });
      const back = await Order.findById(id);
      expect(back.deliveryStatus).toBe("unassigned");
      expect(back.assignedTo).toBeUndefined();
      expect(
        (await OrderTimelineEvent.findOne({ orderId: id, next: "unassigned" })).notes,
      ).toBe("Ramesh taken off; back in Packed, no rider");
      expect(
        (await AuditLog.findOne({ action: "delivery.unassign", target: id }).lean())?.details,
      ).toMatchObject({ from: rider, previous: "assigned" });
      expect((await Notification.findOne({ userId: rider }))?.body).toBe(
        "The store took you off this delivery. If you have already collected the parcel, please bring it back to the shop.",
      );
      expect(await Notification.exists({ userId: customer })).toBeFalsy();
      await expect(removeRider(admin, { orderId: id })).rejects.toThrow("can't be changed");
      // a failed delivery goes through Try again instead
      const failed = await order({ ...ready, deliveryStatus: "failed", assignedTo: rider });
      await expect(removeRider(admin, { orderId: failed })).rejects.toThrow("Try again");
    });

    it("after a missed attempt, tells everyone the same as Try again", async () => {
      const id = await order({ ...ready, deliveryStatus: "attempted", assignedTo: rider });
      await removeRider(admin, { orderId: id });
      expect((await Order.findById(id)).deliveryStatus).toBe("unassigned");
      expect(
        (await Notification.findOne({ userId: customer }).lean())?.title,
      ).toBe("Your delivery will be tried again");
      expect((await Notification.findOne({ userId: rider }))?.body).toBe(
        "The store took you off this delivery. Please bring the parcel back to the shop.",
      );
    });
  });
});
