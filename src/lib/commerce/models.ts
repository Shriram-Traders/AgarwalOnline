import mongoose, { Schema } from "mongoose";
const ref = (name: string) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required: true,
});
const opts = { timestamps: true, strict: "throw" as const };
const addressSchema = new Schema(
  {
    customerId: ref("User"),
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line: { type: String, required: true },
    landmark: String,
    pin: { type: String, required: true },
    areaId: ref("ServiceArea"),
    instructions: String,
    isDefault: { type: Boolean, default: false },
  },
  opts,
);
addressSchema.index({ customerId: 1 });
const cartSchema = new Schema(
  {
    customerId: ref("User"),
    variantId: ref("ProductVariant"),
    quantity: {
      type: Number,
      min: 1,
      max: 100,
      required: true,
      validate: Number.isSafeInteger,
    },
  },
  opts,
);
cartSchema.index({ customerId: 1, variantId: 1 }, { unique: true });
const guestCartSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    lines: [
      {
        variantId: ref("ProductVariant"),
        quantity: {
          type: Number,
          min: 1,
          max: 100,
          required: true,
          validate: Number.isSafeInteger,
        },
        _id: false,
      },
    ],
    expiresAt: { type: Date, required: true },
  },
  opts,
);
guestCartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const slotSchema = new Schema(
  {
    areaId: ref("ServiceArea"),
    date: { type: String, required: true },
    label: { type: String, required: true },
    // minutes after midnight, India time; older slots only have the typed label
    startMinutes: { type: Number, min: 0, max: 1440 },
    endMinutes: { type: Number, min: 0, max: 1440 },
    /** Set when the slot was made from a weekly delivery time. */
    patternId: { type: Schema.Types.ObjectId, ref: "SlotPattern" },
    capacity: { type: Number, min: 1, required: true },
    reserved: { type: Number, min: 0, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  opts,
);
slotSchema.index({ areaId: 1, date: 1, label: 1 }, { unique: true });
slotSchema.index({ date: 1, areaId: 1 });
/** A delivery time that repeats every week, e.g. Mon–Sat 4–7 PM in Nagothane; slots are made from it ahead of time. */
const slotPatternSchema = new Schema(
  {
    areaId: ref("ServiceArea"),
    days: [{ type: Number, min: 0, max: 6 }],
    startMinutes: { type: Number, min: 0, max: 1440, required: true },
    endMinutes: { type: Number, min: 0, max: 1440, required: true },
    capacity: { type: Number, min: 1, required: true },
    enabled: { type: Boolean, default: true },
  },
  opts,
);
slotPatternSchema.index({ areaId: 1, startMinutes: 1, endMinutes: 1 }, { unique: true });
const settingSchema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, default: 0 },
  },
  opts,
);
const itemSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    name: { type: String, required: true },
    label: { type: String, required: true },
    quantity: { type: Number, required: true },
    pricePaise: { type: Number, required: true },
    linePaise: { type: Number, required: true },
    // set by packing (operations/packing.ts): what was ordered, and what didn't go in as ordered
    orderedQuantity: Number,
    unavailableQuantity: Number,
    substituteName: String,
    substituteQuantity: Number,
  },
  { _id: false },
);
const orderSchema = new Schema(
  {
    customerId: ref("User"),
    number: { type: String, unique: true, required: true },
    idempotencyKey: { type: String, required: true },
    items: { type: [itemSchema], required: true },
    address: {
      name: String,
      phone: String,
      line: String,
      pin: String,
      instructions: String,
      areaName: String,
    },
    slotId: ref("DeliverySlot"),
    deliveryDate: String,
    deliveryWindow: String,
    subtotalPaise: Number,
    merchandiseSavingsPaise: { type: Number, default: 0 },
    promotionDiscountPaise: { type: Number, default: 0 },
    appliedPromotion: {
      promotionId: { type: Schema.Types.ObjectId, ref: "Promotion" },
      code: String,
      name: String,
      discountPaise: Number,
      // the offer's terms at checkout, so packing works it out again the same way even if the
      // owner edits the running offer later (older orders fall back to the offer as it is now)
      discountType: { type: String, enum: ["fixed", "percentage"] },
      discountValue: Number,
      maximumDiscountPaise: Number,
    },
    deliveryPaise: Number,
    totalPaise: Number,
    /** The total as placed, kept once packing takes items that weren't there off a cash bill. */
    originalTotalPaise: Number,
    /**
     * Paid online: what the items that weren't packed came to. The payment is left as it is; any
     * refund is made from the owner's Refunds page.
     */
    shortfallPaise: Number,
    orderStatus: {
      type: String,
      enum: ["placed", "confirmed", "cancelled", "completed"],
      default: "placed",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "partially-refunded", "refunded"],
      default: "pending",
    },
    fulfilmentStatus: {
      type: String,
      enum: ["unassigned", "picking", "packed", "ready"],
      default: "unassigned",
    },
    deliveryStatus: {
      type: String,
      enum: [
        "unassigned",
        "assigned",
        "out-for-delivery",
        "attempted",
        "delivered",
        "failed",
        "returned",
      ],
      default: "unassigned",
    },
    paymentMethod: { type: String, enum: ["cod", "razorpay"], required: true },
    codStatus: {
      type: String,
      enum: ["uncollected", "collected", "reconciled"],
      default: "uncollected",
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    expiresAt: Date,
    // the Terms version ticked at checkout (src/lib/legal/version.ts); orders from before it was kept have none
    termsVersion: String,
    termsAcceptedAt: Date,
  },
  opts,
);
orderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ assignedTo: 1, deliveryStatus: 1 });
const reservationSchema = new Schema(
  {
    orderId: ref("Order"),
    variantId: ref("ProductVariant"),
    quantity: { type: Number, required: true },
    status: {
      type: String,
      enum: ["active", "consumed", "released"],
      default: "active",
    },
    expiresAt: Date,
  },
  opts,
);
reservationSchema.index({ orderId: 1, variantId: 1 }, { unique: true });
reservationSchema.index({ status: 1, expiresAt: 1 });
const movementSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    actorId: ref("User"),
    quantity: Number,
    kind: {
      type: String,
      enum: ["reserve", "release", "sale", "adjust"],
      required: true,
    },
    at: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
const timelineSchema = new Schema(
  {
    orderId: ref("Order"),
    actorId: ref("User"),
    dimension: String,
    previous: String,
    next: String,
    notes: String,
    at: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
timelineSchema.index({ orderId: 1, at: 1 });
const sequenceSchema = new Schema({
  key: { type: String, unique: true },
  value: { type: Number, default: 0 },
});
export const Address =
  mongoose.models.Address || mongoose.model("Address", addressSchema);
export const CartLine =
  mongoose.models.CartLine || mongoose.model("CartLine", cartSchema);
export const GuestCart =
  mongoose.models.GuestCart || mongoose.model("GuestCart", guestCartSchema);
export const DeliverySlot =
  mongoose.models.DeliverySlot || mongoose.model("DeliverySlot", slotSchema);
export const SlotPattern =
  mongoose.models.SlotPattern || mongoose.model("SlotPattern", slotPatternSchema);
export const SystemSetting =
  mongoose.models.SystemSetting ||
  mongoose.model("SystemSetting", settingSchema);
export const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);
export const InventoryReservation =
  mongoose.models.InventoryReservation ||
  mongoose.model("InventoryReservation", reservationSchema);
export const InventoryMovement =
  mongoose.models.InventoryMovement ||
  mongoose.model("InventoryMovement", movementSchema);
export const OrderTimelineEvent =
  mongoose.models.OrderTimelineEvent ||
  mongoose.model("OrderTimelineEvent", timelineSchema);
export const Sequence =
  mongoose.models.Sequence || mongoose.model("Sequence", sequenceSchema);
