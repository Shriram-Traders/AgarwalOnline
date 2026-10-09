import mongoose, { Schema } from "mongoose";
const paymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    provider: { type: String, default: "razorpay" },
    providerOrderId: { type: String },
    providerPaymentId: String,
    amountPaise: { type: Number, required: true },
    state: {
      type: String,
      enum: [
        "creating",
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially-refunded",
      ],
      default: "creating",
    },
    refundNeeded: { type: Boolean, default: false },
    refundedPaise: { type: Number, default: 0 },
  },
  { timestamps: true, strict: "throw" },
);
paymentSchema.index(
  { providerOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerOrderId: { $type: "string" } },
  },
);
paymentSchema.index(
  { providerPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: "string" } },
  },
);
const webhookSchema = new Schema(
  {
    eventId: { type: String, unique: true, required: true },
    type: String,
    payloadHash: String,
    outcome: String,
    processedAt: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
const refundSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    processedBy: { type: Schema.Types.ObjectId, ref: "User" },
    providerRefundId: String,
    externalReference: String,
    amountPaise: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    // "tab": taken off what the family owes on its tab, never paid out as well
    mode: { type: String, enum: ["razorpay", "manual", "tab"], required: true },
    status: {
      type: String,
      enum: ["requested", "processing", "processed", "failed"],
      default: "requested",
    },
    failureReason: String,
  },
  { timestamps: true, strict: "throw" },
);
refundSchema.index({ orderId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index(
  { providerRefundId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerRefundId: { $type: "string" } },
  },
);
export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
export const RazorpayWebhookEvent =
  mongoose.models.RazorpayWebhookEvent ||
  mongoose.model("RazorpayWebhookEvent", webhookSchema);
export const Refund =
  mongoose.models.Refund || mongoose.model("Refund", refundSchema);
