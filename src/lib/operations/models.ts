import mongoose, { Schema } from "mongoose";
const ref = (name: string) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required: true,
});
const packingSchema = new Schema(
  {
    orderId: { ...ref("Order"), unique: true },
    packerId: ref("User"),
    items: [
      {
        variantId: ref("ProductVariant"),
        packedQuantity: Number,
        missing: Boolean,
        substitution: String,
        // how many went in as the substitute; unset, all of the rest did
        substituteQuantity: Number,
      },
    ],
    completedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
const collectionSchema = new Schema(
  {
    orderId: { ...ref("Order"), unique: true },
    collectorId: ref("User"),
    expectedPaise: Number,
    collectedPaise: Number,
    collectedAt: Date,
    reconciledBy: { type: Schema.Types.ObjectId, ref: "User" },
    receivedPaise: Number,
    discrepancyPaise: Number,
    reconciliationNote: String,
    reconciledAt: Date,
    discrepancyResolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    discrepancyResolution: String,
    discrepancyResolvedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
const attemptSchema = new Schema(
  {
    orderId: ref("Order"),
    partnerId: ref("User"),
    reason: String,
    at: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
export const PackingChecklist =
  mongoose.models.PackingChecklist ||
  mongoose.model("PackingChecklist", packingSchema);
export const CODCollection =
  mongoose.models.CODCollection ||
  mongoose.model("CODCollection", collectionSchema);
export const DeliveryAttempt =
  mongoose.models.DeliveryAttempt ||
  mongoose.model("DeliveryAttempt", attemptSchema);
