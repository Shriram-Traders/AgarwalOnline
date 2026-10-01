import mongoose, { Schema } from "mongoose";
const approval = new Schema(
  {
    // variant: a new pack size for a product that is already in the shop
    kind: { type: String, enum: ["product", "price", "stock", "variant"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User" },
    state: {
      type: String,
      // withdrawn: taken back by the person who asked; failed: approved for later but could not be applied then
      enum: ["pending", "approved", "rejected", "published", "withdrawn", "failed"],
      default: "pending",
    },
    before: Schema.Types.Mixed,
    after: { type: Schema.Types.Mixed, required: true },
    reason: String,
    failureReason: String,
    scheduledAt: Date,
    reviewedAt: Date,
    publishedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
approval.index(
  { kind: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { state: "pending" } },
);
approval.index({ state: 1, scheduledAt: 1 });
const history = new Schema(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "ApprovalRequest",
      required: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    previous: String,
    next: String,
    comment: String,
    at: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
export const ApprovalRequest =
  mongoose.models.ApprovalRequest ||
  mongoose.model("ApprovalRequest", approval);
export const ApprovalHistory =
  mongoose.models.ApprovalHistory || mongoose.model("ApprovalHistory", history);
