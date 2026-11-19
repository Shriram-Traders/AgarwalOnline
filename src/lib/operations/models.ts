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
    /** the rider's handover this cash went into, so it is handed over only once */
    handoverId: { type: Schema.Types.ObjectId, ref: "CashHandover" },
    /** cash, or UPI to the shop's own account at the door (never with the rider: the owner checks it came in) */
    method: { type: String, enum: ["cash", "upi"], default: "cash" },
  },
  { timestamps: true, strict: "throw" },
);
/** Cash a rider says they handed over at the counter, and the shop's confirmation that it arrived. */
const handoverSchema = new Schema(
  {
    riderId: ref("User"),
    collectionIds: [{ type: Schema.Types.ObjectId, ref: "CODCollection" }],
    amountPaise: { type: Number, required: true },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
    confirmedAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
handoverSchema.index({ riderId: 1, createdAt: -1 });
handoverSchema.index({ confirmedAt: 1, createdAt: -1 });
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
export const CashHandover =
  mongoose.models.CashHandover || mongoose.model("CashHandover", handoverSchema);
export const DeliveryAttempt =
  mongoose.models.DeliveryAttempt ||
  mongoose.model("DeliveryAttempt", attemptSchema);
