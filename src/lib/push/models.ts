import mongoose, { Schema } from "mongoose";

/**
 * A browser that turned on notifications for someone: where to send them (the push service's
 * address for that browser) and the keys to encrypt them with. One row per browser, so a phone
 * and a PC are two rows; a browser belongs to whoever turned it on last.
 */
const pushDeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    /** "Chrome on Android", to tell devices apart. */
    label: String,
    lastSentAt: Date,
  },
  { timestamps: true, strict: "throw" },
);
pushDeviceSchema.index({ endpoint: 1 }, { unique: true });
pushDeviceSchema.index({ userId: 1, updatedAt: -1 });

export const PushDevice = mongoose.models.PushDevice || mongoose.model("PushDevice", pushDeviceSchema);
