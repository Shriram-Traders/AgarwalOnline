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
      enum: ["order", "payment", "delivery", "support", "refund", "system", "family"],
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

export const WishlistItem =
  mongoose.models.WishlistItem ||
  mongoose.model("WishlistItem", wishlistSchema);
export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
