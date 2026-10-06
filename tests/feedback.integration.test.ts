import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, RateLimit, User } from "../src/lib/db/models";
import { Order, OrderTimelineEvent } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { OrderFeedback } from "../src/lib/feedback/models";
import {
  feedbackBoard,
  feedbackCard,
  feedbackForOrder,
  listFeedback,
  markFeedbackRead,
  markRestRead,
  pendingFeedbackOrder,
  replyToFeedback,
  skipFeedback,
  submitFeedback,
} from "../src/lib/feedback/service";

const uri = process.env.TEST_MONGODB_URI;
const DAY = 86_400_000;

describe.skipIf(!uri)("Order ratings and feedback", () => {
  let asha: string, ravi: string, owner: string, admin: string, rider: string;
  let serial = 0;

  /** A delivered cash order, unless told otherwise. */
  async function order(customerId: string, over: Record<string, unknown> = {}, placedDaysAgo = 0) {
    serial += 1;
    const created = await Order.create({
      customerId,
      number: `AGS-FB-${String(serial).padStart(3, "0")}`,
      idempotencyKey: `feedback-${serial}`,
      slotId: new Types.ObjectId(),
      items: [{ variantId: new Types.ObjectId(), name: "Gel Pen Set", label: "Pack of 5", quantity: 1, pricePaise: 9900, linePaise: 9900 }],
      address: { name: "Asha Patil", phone: "9000000181", line: "Fictional House 1", pin: "999999", areaName: "Nagothane" },
      totalPaise: 9900,
      paymentMethod: "cod",
      orderStatus: "confirmed",
      deliveryStatus: "delivered",
      ...over,
    });
    if (placedDaysAgo)
      await Order.collection.updateOne({ _id: created._id }, { $set: { createdAt: new Date(Date.now() - placedDaysAgo * DAY) } });
    return String(created._id);
  }
  /** A rating written straight to the database, for the owner's lists. */
  async function rated(over: Record<string, unknown>) {
    serial += 1;
    return OrderFeedback.create({
      orderId: new Types.ObjectId(),
      orderNumber: `AGS-FB-${String(serial).padStart(3, "0")}`,
      state: "rated",
      rating: 5,
      submittedAt: new Date(),
      ...over,
    });
  }

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Order, OrderTimelineEvent, OrderFeedback, Notification, AuditLog, RateLimit]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    const person = async (name: string, phone: string, roles: string[]) => String((await User.create({ name, phone, roles }))._id);
    asha = await person("Asha Patil", "9000000181", ["customer"]);
    ravi = await person("Ravi Joshi", "9000000182", ["customer"]);
    owner = await person("Owner", "9000000183", ["customer", "super-admin"]);
    admin = await person("Store Admin", "9000000184", ["customer", "admin"]);
    rider = await person("Sunil Rider", "9000000185", ["customer", "delivery"]);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe("which order the popup asks about", () => {
    it("asks about the newest delivered order, and says whether a rider brought it", async () => {
      expect(await pendingFeedbackOrder(asha)).toBeNull();
      await order(asha, {}, 3);
      const newest = await order(asha, { assignedTo: rider });
      await order(asha, { deliveryStatus: "out-for-delivery" });
      expect(await pendingFeedbackOrder(asha)).toEqual({ orderId: newest, number: expect.stringMatching(/^AGS-FB-/), hasRider: true });
      // someone else's deliveries are theirs to rate
      expect(await pendingFeedbackOrder(ravi)).toBeNull();
    });

    it("doesn't count the customer as their own rider", async () => {
      await order(asha, { assignedTo: asha });
      expect((await pendingFeedbackOrder(asha))?.hasRider).toBe(false);
    });

    it("leaves alone orders that are old, cancelled, refunded or not delivered", async () => {
      await order(asha, {}, 15);
      await order(asha, { orderStatus: "cancelled" });
      await order(asha, { paymentStatus: "refunded", paymentMethod: "razorpay" });
      await order(asha, { deliveryStatus: "attempted" });
      expect(await pendingFeedbackOrder(asha)).toBeNull();
    });

    it("never falls back to an older order once the newest is answered", async () => {
      await order(asha, {}, 2);
      const newest = await order(asha);
      await skipFeedback(asha, { orderId: newest });
      expect(await pendingFeedbackOrder(asha)).toBeNull();
      await submitFeedback(asha, { orderId: newest, rating: 4 });
      expect(await pendingFeedbackOrder(asha)).toBeNull();
    });
  });

  describe("sending a rating", () => {
    it("saves the stars, the tags that fit, the comment and the rider as they were", async () => {
      const id = await order(asha, { assignedTo: rider });
      const handedOver = new Date(Date.now() - 2 * 3600_000);
      await OrderTimelineEvent.create({ orderId: id, actorId: rider, dimension: "delivery", previous: "out-for-delivery", next: "delivered", at: handedOver });
      const result = await submitFeedback(asha, {
        orderId: id,
        rating: "2",
        tags: ["late", "on-time", "damaged-item", "nonsense"],
        riderRating: "4",
        comment: "  Came after 8 pm.  ",
        locale: "mr",
      });
      expect(result).toEqual({ rating: 2, complaintType: "damaged-item" });
      const saved = await OrderFeedback.findOne({ orderId: id }).lean<Record<string, unknown>>();
      expect(saved).toMatchObject({
        state: "rated",
        rating: 2,
        tags: ["late", "damaged-item"],
        comment: "Came after 8 pm.",
        locale: "mr",
        riderRating: 4,
        riderName: "Sunil Rider",
        deliveredAt: handedOver,
      });
      expect(String(saved?.riderId)).toBe(rider);
      expect(saved?.submittedAt).toBeInstanceOf(Date);
      expect(saved?.readAt).toBeUndefined();
      expect(saved?.expiresAt).toBeUndefined();
      // what the customer's order page shows back
      expect(await feedbackForOrder(id)).toEqual({ rating: 2, tags: ["late", "damaged-item"], comment: "Came after 8 pm.", riderRating: 4, reply: undefined });
    });

    it("drops a rider rating when nobody was assigned", async () => {
      const id = await order(asha);
      await submitFeedback(asha, { orderId: id, rating: 5, riderRating: 5 });
      const saved = await OrderFeedback.findOne({ orderId: id });
      expect(saved.riderRating).toBeUndefined();
      expect(saved.riderId).toBeUndefined();
    });

    it("is only for the customer's own delivered order", async () => {
      const mine = await order(asha);
      const onItsWay = await order(asha, { deliveryStatus: "out-for-delivery" });
      await expect(submitFeedback(ravi, { orderId: mine, rating: 1 })).rejects.toThrow("FEEDBACK_NOT_FOUND");
      await expect(skipFeedback(ravi, { orderId: mine })).rejects.toThrow("FEEDBACK_NOT_FOUND");
      await expect(submitFeedback(asha, { orderId: onItsWay, rating: 5 })).rejects.toThrow("FEEDBACK_NOT_DELIVERED");
      await expect(submitFeedback(asha, { orderId: mine, rating: 6 })).rejects.toThrow();
      await expect(submitFeedback(asha, { orderId: mine, rating: 3, comment: "x".repeat(501) })).rejects.toThrow();
      expect(await OrderFeedback.countDocuments({})).toBe(0);
    });

    it("closes a month after delivery", async () => {
      const id = await order(asha, {}, 40);
      await OrderTimelineEvent.create({ orderId: id, actorId: rider, dimension: "delivery", next: "delivered", at: new Date(Date.now() - 31 * DAY) });
      await expect(submitFeedback(asha, { orderId: id, rating: 5 })).rejects.toThrow("FEEDBACK_TOO_LATE");
    });

    it("is final: a second rating is refused and changes nothing", async () => {
      const id = await order(asha);
      await submitFeedback(asha, { orderId: id, rating: 5, tags: ["on-time"] });
      await expect(submitFeedback(asha, { orderId: id, rating: 1, tags: ["late"] })).rejects.toThrow("FEEDBACK_ALREADY");
      // nor can "Not now" undo it
      await skipFeedback(asha, { orderId: id });
      expect(await OrderFeedback.find({ orderId: id }).lean()).toMatchObject([{ state: "rated", rating: 5, tags: ["on-time"] }]);
    });

    it("turns a Not now into a rating when the customer comes back to it", async () => {
      const id = await order(asha);
      await skipFeedback(asha, { orderId: id });
      await skipFeedback(asha, { orderId: id });
      const skipped = await OrderFeedback.findOne({ orderId: id });
      expect(skipped.state).toBe("skipped");
      expect(skipped.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * DAY);
      expect(await feedbackForOrder(id)).toBeNull();
      await submitFeedback(asha, { orderId: id, rating: 4 });
      const after = await OrderFeedback.find({ orderId: id });
      expect(after).toHaveLength(1);
      expect(after[0].state).toBe("rated");
      expect(after[0].expiresAt).toBeUndefined();
    });

    it("lets only one of two ratings sent at once through", async () => {
      const id = await order(asha);
      const results = await Promise.allSettled([
        submitFeedback(asha, { orderId: id, rating: 5 }),
        submitFeedback(asha, { orderId: id, rating: 1 }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await OrderFeedback.countDocuments({ orderId: id })).toBe(1);
    });

    it("slows down someone hammering the form", async () => {
      const id = await order(asha, { deliveryStatus: "out-for-delivery" });
      for (let attempt = 0; attempt < 10; attempt++)
        await expect(submitFeedback(asha, { orderId: id, rating: 5 })).rejects.toThrow("FEEDBACK_NOT_DELIVERED");
      await expect(submitFeedback(asha, { orderId: id, rating: 5 })).rejects.toThrow("Too many attempts");
    });
  });

  describe("the owner's reading page", () => {
    it("is for the owner only", async () => {
      const row = await rated({ rating: 1 });
      for (const person of [admin, rider, asha]) {
        await expect(feedbackBoard(person, 30)).rejects.toThrow("FORBIDDEN");
        await expect(listFeedback(person, { tab: "all", period: 30 })).rejects.toThrow("FORBIDDEN");
        await expect(feedbackCard(person, String(row._id))).rejects.toThrow("FORBIDDEN");
        await expect(markFeedbackRead(person, { feedbackId: String(row._id), read: true })).rejects.toThrow("FORBIDDEN");
        await expect(markRestRead(person)).rejects.toThrow("FORBIDDEN");
        await expect(replyToFeedback(person, { feedbackId: String(row._id), reply: "Thank you" })).rejects.toThrow("FORBIDDEN");
      }
      expect((await OrderFeedback.findById(row._id)).readAt).toBeUndefined();
    });

    it("adds up the scoreboard for the period", async () => {
      const riderId = new Types.ObjectId(rider);
      await rated({ rating: 5, tags: ["on-time", "well-packed"], comment: "Lovely", riderId, riderName: "Sunil Rider", riderRating: 5 });
      await rated({ rating: 5, tags: ["on-time"], riderId, riderName: "Sunil Rider", riderRating: 4 });
      await rated({ rating: 2, tags: ["late"], comment: "Late", readAt: new Date() });
      await rated({ rating: 1, tags: ["late", "rude-partner"] });
      // outside the last 30 days, but still unread and low
      await rated({ rating: 1, submittedAt: new Date(Date.now() - 45 * DAY) });
      await OrderFeedback.create({ orderId: new Types.ObjectId(), orderNumber: "AGS-FB-SKIP", state: "skipped" });

      const month = await feedbackBoard(owner, 30);
      expect(month).toMatchObject({ count: 4, commented: 2, stars: [2, 0, 0, 1, 1], attention: 2, unread: 4 });
      expect(month.average).toBeCloseTo(3.25);
      expect(month.tags.slice(0, 2)).toEqual([
        { tag: "late", count: 2 },
        { tag: "on-time", count: 2 },
      ]);
      expect(month.riders).toEqual([{ name: "Sunil Rider", average: 4.5, count: 2 }]);
      expect((await feedbackBoard(owner, "all")).count).toBe(5);
      const quiet = await feedbackBoard(owner, 7);
      expect(quiet.count).toBe(4);
      await OrderFeedback.deleteMany({});
      expect(await feedbackBoard(owner, 30)).toMatchObject({ count: 0, average: 0, stars: [0, 0, 0, 0, 0], tags: [], riders: [], attention: 0, unread: 0 });
    });

    it("lists low unread ratings first, then other unread, then what's been read", async () => {
      const first = await order(asha, { address: { name: "Asha Patil", phone: "9000000181" } });
      const second = await order(ravi, { address: { name: "Ravi Joshi", phone: "9000000182" } });
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
      const happy = await rated({ rating: 5, submittedAt: minutesAgo(1), orderId: new Types.ObjectId(first), orderNumber: "AGS-FB-HAPPY" });
      const read = await rated({ rating: 1, submittedAt: minutesAgo(2), readAt: new Date() });
      const low = await rated({ rating: 2, submittedAt: minutesAgo(30), orderId: new Types.ObjectId(second), orderNumber: "AGS-FB-LOW" });
      const all = await listFeedback(owner, { tab: "all", period: 30 });
      expect(all.cards.map((card) => card.id)).toEqual([String(low._id), String(happy._id), String(read._id)]);
      expect(all).toMatchObject({ total: 3, page: 1, pages: 1 });
      expect(all.cards[0]).toMatchObject({ customer: "Ravi Joshi", phone: "9000000182", orderId: second, totalPaise: 9900, read: false });

      expect((await listFeedback(owner, { tab: "attention", period: 30 })).cards.map((card) => card.id)).toEqual([String(low._id)]);
      expect((await listFeedback(owner, { tab: "unread", period: 30 })).total).toBe(2);
      expect((await listFeedback(owner, { tab: "all", period: 30, rating: 1 })).cards.map((card) => card.id)).toEqual([String(read._id)]);
      // found by the order number, the name on the order or its phone
      for (const q of ["fb-low", "ravi", "9000000182", "+91 90000 00182"])
        expect((await listFeedback(owner, { tab: "all", period: 30, q })).cards.map((card) => card.orderNumber), q).toEqual(["AGS-FB-LOW"]);
      expect((await listFeedback(owner, { tab: "all", period: 30, q: "nobody" })).total).toBe(0);
      // a digit in an order number isn't a phone number: both phones here contain an 8
      expect((await listFeedback(owner, { tab: "all", period: 30, q: "fb-8" })).total).toBe(0);
    });

    it("turns the pages, 20 at a time", async () => {
      for (let index = 0; index < 23; index++) await rated({ rating: 4, submittedAt: new Date(Date.now() - index * 60_000) });
      const first = await listFeedback(owner, { tab: "all", period: 30 });
      expect(first).toMatchObject({ total: 23, page: 1, pages: 2 });
      expect(first.cards).toHaveLength(20);
      const second = await listFeedback(owner, { tab: "all", period: 30, page: 2 });
      expect(second.cards).toHaveLength(3);
      expect(new Set([...first.cards, ...second.cards].map((card) => card.id)).size).toBe(23);
      // a page past the end shows the last one rather than nothing
      expect((await listFeedback(owner, { tab: "all", period: 30, page: 9 })).page).toBe(2);
    });

    it("marks read and unread, and never bulk-dismisses a low rating", async () => {
      const low = await rated({ rating: 1 });
      const fine = await rated({ rating: 3 });
      const good = await rated({ rating: 5 });
      await markFeedbackRead(owner, { feedbackId: String(good._id), read: true });
      expect(String((await OrderFeedback.findById(good._id)).readBy)).toBe(owner);
      await markFeedbackRead(owner, { feedbackId: String(good._id), read: false });
      expect((await OrderFeedback.findById(good._id)).readAt).toBeUndefined();
      expect(await markRestRead(owner)).toBe(2);
      expect((await OrderFeedback.findById(fine._id)).readAt).toBeInstanceOf(Date);
      expect((await OrderFeedback.findById(low._id)).readAt).toBeUndefined();
      await expect(markFeedbackRead(owner, { feedbackId: String(new Types.ObjectId()), read: true })).rejects.toThrow("FEEDBACK_NOT_FOUND");
    });

    it("sends one reply: saved, audited, and told to the customer in their language", async () => {
      const id = await order(asha);
      await submitFeedback(asha, { orderId: id, rating: 2, tags: ["late"], locale: "mr" });
      const feedback = await OrderFeedback.findOne({ orderId: id });
      await expect(replyToFeedback(owner, { feedbackId: String(feedback._id), reply: "No" })).rejects.toThrow();
      await replyToFeedback(owner, { feedbackId: String(feedback._id), reply: "Sorry about the delay. We have spoken to the rider." });

      const saved = await OrderFeedback.findById(feedback._id);
      expect(saved.reply.body).toBe("Sorry about the delay. We have spoken to the rider.");
      expect(String(saved.reply.by)).toBe(owner);
      // replying is reading
      expect(saved.readAt).toBeInstanceOf(Date);
      expect(await AuditLog.findOne({ action: "feedback.reply" }).lean()).toMatchObject({ target: String(feedback._id), details: { rating: 2 } });
      const notes = await Notification.find({ userId: asha }).lean<{ type: string; title: string; body: string; href: string }[]>();
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: "support", title: "तुमच्या रेटिंगला दुकानाने उत्तर दिले", href: `/account/orders/${id}#feedback` });
      expect(notes[0].body).toContain("Sorry about the delay");
      expect((await feedbackForOrder(id))?.reply?.body).toBe("Sorry about the delay. We have spoken to the rider.");
      expect((await feedbackCard(owner, String(feedback._id)))?.reply?.body).toContain("Sorry about the delay");

      await expect(replyToFeedback(owner, { feedbackId: String(feedback._id), reply: "One more thing" })).rejects.toThrow("FEEDBACK_REPLIED");
      expect(await Notification.countDocuments({ userId: asha })).toBe(1);
      expect(await AuditLog.countDocuments({ action: "feedback.reply" })).toBe(1);
    });
  });
});
