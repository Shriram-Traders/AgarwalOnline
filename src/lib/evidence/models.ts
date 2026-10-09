import mongoose, { Schema } from "mongoose";

const evidenceSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    complaintId: { type: Schema.Types.ObjectId, ref: "Complaint" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    purpose: {
      type: String,
      // "product-draft": chosen on Add product before the product exists; it becomes "product" once the product is made
      enum: ["complaint", "packing", "delivery", "failed-delivery", "product", "product-draft"],
      required: true,
    },
    provider: { type: String, enum: ["local", "cloudinary"], required: true },
    storageKey: { type: String, required: true },
    url: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    expiresAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
evidenceSchema.index({ orderId: 1, createdAt: -1 });
evidenceSchema.index({ complaintId: 1, createdAt: -1 });
evidenceSchema.index({ productId: 1, createdAt: -1 });
evidenceSchema.index({ expiresAt: 1 });

export const UploadedEvidence =
  mongoose.models.UploadedEvidence ||
  mongoose.model("UploadedEvidence", evidenceSchema);
