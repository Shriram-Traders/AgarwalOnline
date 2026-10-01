import mongoose, { Schema } from "mongoose";

const promotionSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, uppercase: true, trim: true },
    kind: { type: String, enum: ["automatic", "code"], required: true },
    discountType: { type: String, enum: ["fixed", "percentage"], required: true },
    discountValue: { type: Number, min: 1, required: true },
    minimumSubtotalPaise: { type: Number, min: 0, default: 0 },
    maximumDiscountPaise: { type: Number, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    globalLimit: { type: Number, min: 1 },
    perCustomerLimit: { type: Number, min: 1, default: 1 },
    redemptionCount: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: false },
    /** The coupon the top bar offers to new shoppers; the owner picks it, at most one at a time. */
    welcome: { type: Boolean, default: false },
    /** Coupon codes shown in the basket's list of shop offers; off for private codes handed out in person. */
    listed: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, strict: "throw" },
);
promotionSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } },
);
promotionSchema.index({ active: 1, startsAt: 1, endsAt: 1 });

const redemptionSchema = new Schema(
  {
    promotionId: { type: Schema.Types.ObjectId, ref: "Promotion", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    discountPaise: { type: Number, min: 1, required: true },
  },
  { timestamps: true, strict: "throw" },
);
redemptionSchema.index({ promotionId: 1, orderId: 1 }, { unique: true });
redemptionSchema.index({ promotionId: 1, customerId: 1 });

export const Promotion =
  mongoose.models.Promotion || mongoose.model("Promotion", promotionSchema);
export const PromotionRedemption =
  mongoose.models.PromotionRedemption ||
  mongoose.model("PromotionRedemption", redemptionSchema);
