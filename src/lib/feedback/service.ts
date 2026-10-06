import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { Order, OrderTimelineEvent } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Permission, type Role } from "../auth/permissions";
import { rateLimit } from "../auth/rate-limit";
import { notify } from "../engagement/service";
import { OrderFeedback } from "./models";
import { FEEDBACK_PERMISSION } from "./access";
import { feedbackCopy } from "./copy";
import {
  cleanTags,
  complaintTypeFor,
  DAY_MS,
  LOW_RATING,
  NEEDS_ATTENTION,
  PROMPT_WINDOW_DAYS,
  RATE_WINDOW_DAYS,
  SKIP_KEEP_DAYS,
  type FeedbackTag,
} from "./rules";

const DUPLICATE = 11000;
const PAGE_SIZE = 20;

async function actor(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true }).select("roles");
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], permission);
}

/** When the order was handed over: the timeline says so; orders made without one fall back to their last change. */
async function deliveredTime(order: { _id: unknown; updatedAt: Date }): Promise<Date> {
  const event = await OrderTimelineEvent.findOne({ orderId: order._id, dimension: "delivery", next: "delivered" })
    .sort({ at: -1 })
    .select("at");
  return event?.at ?? order.updatedAt;
}

export type PendingFeedback = { orderId: string; number: string; hasRider: boolean };

/**
 * The order the popup should ask about: this customer's newest delivered order from the last
 * two weeks, if they haven't rated or skipped it. Only ever the newest, so answering one never
 * brings up an older one. One query on the customer's orders index.
 */
export async function pendingFeedbackOrder(customerId: string, now = new Date()): Promise<PendingFeedback | null> {
  await connectDB();
  const [order] = await Order.aggregate([
    {
      $match: {
        customerId: new Types.ObjectId(customerId),
        createdAt: { $gte: new Date(now.getTime() - PROMPT_WINDOW_DAYS * DAY_MS) },
        deliveryStatus: "delivered",
        orderStatus: { $ne: "cancelled" },
        // a fully refunded order isn't one to ask "how did we do?" about
        paymentStatus: { $ne: "refunded" },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 1 },
    { $lookup: { from: OrderFeedback.collection.name, localField: "_id", foreignField: "orderId", as: "feedback" } },
    { $match: { feedback: { $size: 0 } } },
    { $project: { number: 1, assignedTo: 1 } },
  ]);
  if (!order) return null;
  return {
    orderId: String(order._id),
    number: order.number,
    hasRider: Boolean(order.assignedTo) && String(order.assignedTo) !== customerId,
  };
}

/** The customer's own delivered order, or the reason it can't be rated. */
async function ratableOrder(actorId: string, orderId: string) {
  const order = await Order.findOne({ _id: orderId, customerId: actorId }).select(
    "number deliveryStatus assignedTo updatedAt",
  );
  if (!order) throw Error("FEEDBACK_NOT_FOUND");
  if (order.deliveryStatus !== "delivered") throw Error("FEEDBACK_NOT_DELIVERED");
  return order;
}

/** Whether the stars are still open for an order delivered at this time. */
export function canStillRate(deliveredAt: Date, now = new Date()) {
  return now.getTime() - deliveredAt.getTime() <= RATE_WINDOW_DAYS * DAY_MS;
}

/** A customer's rating of their own delivered order. Final once sent. */
export async function submitFeedback(actorId: string, input: unknown) {
  await actor(actorId, "order:own");
  const data = z
    .object({
      orderId: objectId,
      rating: z.coerce.number().int().min(1).max(5),
      tags: z.array(z.string().max(40)).max(20).default([]),
      riderRating: z.coerce.number().int().min(1).max(5).optional(),
      comment: z.string().trim().max(500).default(""),
      locale: z.enum(["en", "mr"]).default("en"),
    })
    .parse(input);
  await rateLimit(`feedback:${actorId}`, 10);
  const order = await ratableOrder(actorId, data.orderId);
  const deliveredAt = await deliveredTime(order);
  if (!canStillRate(deliveredAt)) throw Error("FEEDBACK_TOO_LATE");
  // staff who deliver their own test order don't rate themselves
  const rider =
    order.assignedTo && String(order.assignedTo) !== actorId
      ? await User.findById(order.assignedTo).select("name")
      : null;
  const tags = cleanTags(data.rating, data.tags);
  try {
    await OrderFeedback.findOneAndUpdate(
      // a "Not now" row becomes the rating; a rating is never replaced
      { orderId: order._id, state: { $ne: "rated" } },
      {
        $set: {
          state: "rated",
          rating: data.rating,
          tags,
          locale: data.locale,
          deliveredAt,
          submittedAt: new Date(),
          ...(data.comment ? { comment: data.comment } : {}),
          ...(rider ? { riderId: rider._id, riderName: rider.name } : {}),
          ...(rider && data.riderRating ? { riderRating: data.riderRating } : {}),
        },
        $unset: { expiresAt: 1 },
        $setOnInsert: { orderNumber: order.number },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE) throw Error("FEEDBACK_ALREADY");
    throw error;
  }
  return { rating: data.rating, complaintType: complaintTypeFor(data.rating, tags) };
}

/** "Not now", the X, Escape or a tap outside: remember it, so the popup doesn't ask about this order again. */
export async function skipFeedback(actorId: string, input: unknown) {
  await actor(actorId, "order:own");
  const data = z.object({ orderId: objectId }).parse(input);
  const order = await ratableOrder(actorId, data.orderId);
  try {
    await OrderFeedback.updateOne(
      { orderId: order._id },
      // only ever written when there is no row: a rating is never turned back into a skip
      {
        $setOnInsert: {
          orderNumber: order.number,
          state: "skipped",
          expiresAt: new Date(Date.now() + SKIP_KEEP_DAYS * DAY_MS),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // two tabs closing at once: the other one wrote it
    if ((error as { code?: number }).code !== DUPLICATE) throw error;
  }
}

export type OwnFeedback = {
  rating: number;
  tags: FeedbackTag[];
  comment?: string;
  riderRating?: number;
  reply?: { body: string; at: string };
};

/** What the order page shows its customer: their rating and the shop's reply. The page has already checked the order is theirs. */
export async function feedbackForOrder(orderId: unknown): Promise<OwnFeedback | null> {
  const feedback = await OrderFeedback.findOne({ orderId, state: "rated" }).lean<{
    rating: number;
    tags?: FeedbackTag[];
    comment?: string;
    riderRating?: number;
    reply?: { body?: string; at?: Date };
  }>();
  if (!feedback) return null;
  return {
    rating: feedback.rating,
    tags: feedback.tags ?? [],
    comment: feedback.comment,
    riderRating: feedback.riderRating,
    reply: feedback.reply?.body && feedback.reply.at ? { body: feedback.reply.body, at: feedback.reply.at.toISOString() } : undefined,
  };
}

// ---- the owner's side ----

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number] | "all";
const since = (period: Period, now = new Date()) => (period === "all" ? null : new Date(now.getTime() - period * DAY_MS));

export type FeedbackBoard = {
  count: number;
  /** 0 when nothing was rated in the period. */
  average: number;
  commented: number;
  /** Counts for 5, 4, 3, 2 and 1 stars, in that order. */
  stars: [number, number, number, number, number];
  tags: { tag: FeedbackTag; count: number }[];
  riders: { name: string; average: number; count: number }[];
  /** Low ratings nobody has read, whatever the period: the same number as the menu badge. */
  attention: number;
  unread: number;
};

/** The scoreboard: one pass over the period's ratings, plus the two waiting counts. */
export async function feedbackBoard(actorId: string, period: Period): Promise<FeedbackBoard> {
  await actor(actorId, FEEDBACK_PERMISSION);
  const from = since(period);
  const [[facets], attention, unread] = await Promise.all([
    OrderFeedback.aggregate([
      { $match: { state: "rated", ...(from ? { submittedAt: { $gte: from } } : {}) } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                sum: { $sum: "$rating" },
                commented: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$comment", ""] } }, 0] }, 1, 0] } },
              },
            },
          ],
          stars: [{ $group: { _id: "$rating", count: { $sum: 1 } } }],
          tags: [
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 8 },
          ],
          riders: [
            { $match: { riderRating: { $gte: 1 } } },
            { $sort: { submittedAt: 1 } },
            { $group: { _id: "$riderId", name: { $last: "$riderName" }, count: { $sum: 1 }, sum: { $sum: "$riderRating" } } },
            { $sort: { count: -1, name: 1 } },
            { $limit: 10 },
          ],
        },
      },
    ]),
    OrderFeedback.countDocuments(NEEDS_ATTENTION),
    OrderFeedback.countDocuments({ state: "rated", readAt: null }),
  ]);
  const totals = facets?.totals[0] ?? { count: 0, sum: 0, commented: 0 };
  const starCount = (stars: number) =>
    (facets?.stars as { _id: number; count: number }[] | undefined)?.find((row) => row._id === stars)?.count ?? 0;
  return {
    count: totals.count,
    average: totals.count ? totals.sum / totals.count : 0,
    commented: totals.commented,
    stars: [starCount(5), starCount(4), starCount(3), starCount(2), starCount(1)],
    tags: ((facets?.tags ?? []) as { _id: FeedbackTag; count: number }[]).map((row) => ({ tag: row._id, count: row.count })),
    riders: ((facets?.riders ?? []) as { name?: string; count: number; sum: number }[]).map((row) => ({
      name: row.name ?? "Delivery partner",
      average: row.sum / row.count,
      count: row.count,
    })),
    attention,
    unread,
  };
}

export type FeedbackTab = "attention" | "unread" | "all";
export type FeedbackCard = {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  phone?: string;
  totalPaise?: number;
  rating: number;
  tags: FeedbackTag[];
  comment?: string;
  riderName?: string;
  riderRating?: number;
  submittedAt: Date;
  read: boolean;
  reply?: { body: string; at: Date };
};

type FeedbackDoc = {
  _id: unknown;
  orderId: unknown;
  orderNumber: string;
  rating: number;
  tags?: FeedbackTag[];
  comment?: string;
  riderName?: string;
  riderRating?: number;
  submittedAt: Date;
  readAt?: Date | null;
  reply?: { body?: string; at?: Date };
};

/** Each rating with who sent it: the name and phone on the order, or the account's when the order has none. */
async function cardsFor(docs: FeedbackDoc[]): Promise<FeedbackCard[]> {
  const orders = await Order.find({ _id: { $in: docs.map((doc) => doc.orderId) } })
    .select("customerId address.name address.phone totalPaise")
    .lean<{ _id: unknown; customerId: unknown; address?: { name?: string; phone?: string }; totalPaise?: number }[]>();
  const users = await User.find({ _id: { $in: orders.map((order) => order.customerId) } })
    .select("name phone")
    .lean<{ _id: unknown; name?: string; phone?: string }[]>();
  return docs.map((doc) => {
    const order = orders.find((candidate) => String(candidate._id) === String(doc.orderId));
    const user = users.find((candidate) => String(candidate._id) === String(order?.customerId));
    return {
      id: String(doc._id),
      orderId: String(doc.orderId),
      orderNumber: doc.orderNumber,
      customer: order?.address?.name || user?.name || "Customer",
      phone: order?.address?.phone || user?.phone || undefined,
      totalPaise: order?.totalPaise,
      rating: doc.rating,
      tags: doc.tags ?? [],
      comment: doc.comment,
      riderName: doc.riderName,
      riderRating: doc.riderRating,
      submittedAt: doc.submittedAt,
      read: Boolean(doc.readAt),
      reply: doc.reply?.body && doc.reply.at ? { body: doc.reply.body, at: doc.reply.at } : undefined,
    };
  });
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The owner's reading list, 20 to a page: low ratings nobody has read first, then the other
 * unread ones, then what's been read, newest first within each. "Needs attention" and "Unread"
 * ignore the period, so they always agree with the badge.
 */
export async function listFeedback(
  actorId: string,
  input: { tab: FeedbackTab; q?: string; rating?: number; period: Period; page?: number },
) {
  await actor(actorId, FEEDBACK_PERMISSION);
  const term = input.q?.trim().slice(0, 40);
  // the order number is kept on the rating itself; the name and phone are on the order.
  // Only something typed like a phone number is looked up as one: the "2" in "AGS-…-2" isn't.
  const digits = term?.replace(/[\s+-]/g, "") ?? "";
  const phone = /^\d{4,}$/.test(digits) ? digits.slice(-10) : null;
  const named = term
    ? await Order.find({
        $or: [
          { "address.name": new RegExp(escapeRegex(term), "i") },
          ...(phone ? [{ "address.phone": new RegExp(phone) }] : []),
        ],
      })
        .select("_id")
        .limit(200)
    : null;
  const from = input.tab === "all" ? since(input.period) : null;
  const filter = {
    ...(input.tab === "attention" ? NEEDS_ATTENTION : input.tab === "unread" ? { state: "rated", readAt: null } : { state: "rated" }),
    ...(from ? { submittedAt: { $gte: from } } : {}),
    ...(input.rating && input.tab !== "attention" ? { rating: input.rating } : {}),
    ...(term && named
      ? { $or: [{ orderNumber: new RegExp(escapeRegex(term), "i") }, { orderId: { $in: named.map((order) => order._id) } }] }
      : {}),
  };
  const total = await OrderFeedback.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1) || 1), pages);
  const docs: FeedbackDoc[] = await OrderFeedback.aggregate([
    { $match: filter },
    {
      $addFields: {
        rank: { $cond: [{ $ifNull: ["$readAt", false] }, 2, { $cond: [{ $lte: ["$rating", LOW_RATING] }, 0, 1] }] },
      },
    },
    { $sort: { rank: 1, submittedAt: -1, _id: 1 } },
    { $skip: (page - 1) * PAGE_SIZE },
    { $limit: PAGE_SIZE },
  ]);
  return { cards: await cardsFor(docs), total, page, pages };
}

/** One rating, for the reply panel when it isn't on the page being shown. */
export async function feedbackCard(actorId: string, feedbackId: string): Promise<FeedbackCard | null> {
  await actor(actorId, FEEDBACK_PERMISSION);
  if (!objectId.safeParse(feedbackId).success) return null;
  const doc = await OrderFeedback.findOne({ _id: feedbackId, state: "rated" }).lean<FeedbackDoc>();
  return doc ? (await cardsFor([doc]))[0] : null;
}

export async function markFeedbackRead(actorId: string, input: unknown) {
  await actor(actorId, FEEDBACK_PERMISSION);
  const data = z.object({ feedbackId: objectId, read: z.boolean() }).parse(input);
  const result = await OrderFeedback.updateOne(
    { _id: data.feedbackId, state: "rated" },
    data.read ? { $set: { readAt: new Date(), readBy: actorId } } : { $unset: { readAt: 1, readBy: 1 } },
  );
  if (!result.matchedCount) throw Error("FEEDBACK_NOT_FOUND");
}

/** "Mark 3–5 star feedback as read": low ratings are left for someone to open one by one. */
export async function markRestRead(actorId: string) {
  await actor(actorId, FEEDBACK_PERMISSION);
  const result = await OrderFeedback.updateMany(
    { state: "rated", readAt: null, rating: { $gt: LOW_RATING } },
    { $set: { readAt: new Date(), readBy: actorId } },
  );
  return result.modifiedCount;
}

/**
 * The shop's one reply to a rating. The customer is told in their notifications and sees it on
 * the order page, so it can't be edited afterwards; replying also marks the rating as read.
 */
export async function replyToFeedback(actorId: string, input: unknown) {
  await actor(actorId, FEEDBACK_PERMISSION);
  const data = z.object({ feedbackId: objectId, reply: z.string().trim().min(5).max(1000) }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const feedback = await OrderFeedback.findOne({ _id: data.feedbackId, state: "rated" }).session(session);
    if (!feedback) throw Error("FEEDBACK_NOT_FOUND");
    if (feedback.reply?.at) throw Error("FEEDBACK_REPLIED");
    const now = new Date();
    feedback.reply = { body: data.reply, by: actorId, at: now };
    if (!feedback.readAt) {
      feedback.readAt = now;
      feedback.readBy = actorId;
    }
    await feedback.save({ session });
    await AuditLog.create(
      [{ actorId, action: "feedback.reply", target: String(feedback._id), details: { order: feedback.orderNumber, rating: feedback.rating } }],
      { session },
    );
    const order = await Order.findById(feedback.orderId).select("customerId").session(session);
    if (!order) return;
    const text = feedbackCopy[feedback.locale === "mr" ? "mr" : "en"];
    await notify(
      {
        userId: order.customerId,
        // the same kind the shop's chat messages use
        type: "support",
        title: text.replyTitle,
        body: text.replyBody(feedback.orderNumber, data.reply),
        href: `/account/orders/${order._id}#feedback`,
      },
      session,
    );
  });
}
