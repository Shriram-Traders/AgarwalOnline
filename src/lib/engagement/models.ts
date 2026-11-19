import mongoose, { Schema } from "mongoose";

const wishlistSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  },
  { timestamps: true, strict: "throw" },
);
wishlistSchema.index({ customerId: 1, productId: 1 }, { unique: true });
wishlistSchema.index({ customerId: 1, createdAt: -1 });

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      // stock: a pack they asked about is back; basket: the one reminder about items left in the basket
      enum: ["order", "payment", "delivery", "support", "refund", "system", "family", "stock", "basket"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    href: String,
    readAt: Date,
    expiresAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// "Tell me when it's back" on a sold-out pack: sent once when it's back, then gone; unsent ones lapse after 90 days
const stockAlertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, strict: "throw" },
);
stockAlertSchema.index({ userId: 1, variantId: 1 }, { unique: true });
stockAlertSchema.index({ variantId: 1 });
stockAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StockAlert = mongoose.models.StockAlert || mongoose.model("StockAlert", stockAlertSchema);
export const WishlistItem =
  mongoose.models.WishlistItem ||
  mongoose.model("WishlistItem", wishlistSchema);
export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
