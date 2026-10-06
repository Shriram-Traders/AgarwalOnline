import mongoose, { Schema } from "mongoose";
import { FEEDBACK_TAGS } from "./rules";

/**
 * What a customer said about one order, or that they chose not to say ("skipped", so the popup
 * doesn't ask again). One row per order. There is no customerId on purpose: who may write or
 * read a row is always decided through the order itself.
 */
const feedbackSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    /** Copied from the order, for the owner's search and the cards. */
    orderNumber: { type: String, required: true },
    state: { type: String, enum: ["skipped", "rated"], required: true },
    rating: { type: Number, min: 1, max: 5 },
    tags: [{ type: String, enum: FEEDBACK_TAGS }],
    comment: { type: String, maxlength: 500 },
    /** The language the customer was using, so the shop's reply is announced in it. */
    locale: { type: String, enum: ["en", "mr"] },
    // the delivery partner as they were when it was rated: the order can be reassigned or the name changed later
    riderRating: { type: Number, min: 1, max: 5 },
    riderId: { type: Schema.Types.ObjectId, ref: "User" },
    riderName: String,
    deliveredAt: Date,
    /** When it became "rated": what the owner's page sorts and counts by. */
    submittedAt: Date,
    readAt: Date,
    readBy: { type: Schema.Types.ObjectId, ref: "User" },
    /** The shop's one reply, shown to the customer on the order page. */
    reply: {
      body: { type: String, maxlength: 1000 },
      by: { type: Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },
    /** Set on a "skipped" row only, so it deletes itself. */
    expiresAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
feedbackSchema.index({ orderId: 1 }, { unique: true });
// the owner's tabs, the menu badge and the overview queue
feedbackSchema.index({ state: 1, readAt: 1, rating: 1, submittedAt: -1 });
// the scoreboard for a period
feedbackSchema.index({ state: 1, submittedAt: -1 });
feedbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OrderFeedback = mongoose.models.OrderFeedback || mongoose.model("OrderFeedback", feedbackSchema);
