import mongoose, { Schema } from "mongoose";

export const CLASSES = ["Nursery", "Jr KG", "Sr KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export const FAMILY_LIMITS = { adults: 6, children: 8 } as const;
/** "Class 5", "Sr KG": numbers read as a class, the pre-school years as themselves. */
export const classLabel = (className: string, mr = false) =>
  /^\d+$/.test(className) ? `${mr ? "इयत्ता" : "Class"} ${className}` : className;

/** Children have no login: a name, and the school and class their kit comes from. */
const childSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
  school: { type: String, trim: true, maxlength: 80, default: "" },
  className: { type: String, enum: CLASSES, required: true },
  // the academic year the class was last confirmed for, "2026-27"
  year: { type: String, match: /^\d{4}-\d{2}$/, required: true },
});

/**
 * One household. Adults sign in and see the family's spend; the owner manages people.
 * The unique multikey index on `adults` is what keeps a person in one family only.
 */
const familySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    adults: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // one link lets one person in; joining replaces it
    inviteToken: { type: String, required: true },
    children: [childSchema],
    /**
     * The khata. Only the limit is money kept here: what the family owes is always worked out
     * from its tab orders, tab refunds and payments. Checkouts and payments write
     * `lastChargeAt` / `lastPaymentAt` first, which serialises them on this document.
     */
    tab: {
      status: { type: String, enum: ["requested", "active", "paused", "closed"] },
      limitPaise: { type: Number, min: 0, max: 10_000_000, validate: Number.isSafeInteger },
      requestedAt: Date,
      decidedAt: Date,
      decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
      lastChargeAt: Date,
      lastPaymentAt: Date,
      // the last "YYYY-MM" a statement went out for
      statementMonth: String,
    },
  },
  { timestamps: true, strict: "throw" },
);
familySchema.index({ adults: 1 }, { unique: true });
familySchema.index({ "tab.status": 1, updatedAt: -1 });
familySchema.index({ inviteToken: 1 }, { unique: true });

/** What counts as spent: not cancelled, and not a delivery that failed or came back. */
export const SPENT = {
  orderStatus: { $ne: "cancelled" },
  deliveryStatus: { $nin: ["failed", "returned"] },
};

export const Family = mongoose.models.Family || mongoose.model("Family", familySchema);

/** School names match without regard to capitals, so "St. Mary's" and "st. mary's" are one school. */
export const SCHOOL_COLLATION = { locale: "en", strength: 2 } as const;

/** What a school asks a class to bring for a year, kept by the store and bought by parents in one tap. */
const kitSchema = new Schema(
  {
    school: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    className: { type: String, enum: CLASSES, required: true },
    year: { type: String, match: /^\d{4}-\d{2}$/, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    items: {
      type: [
        {
          variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
          quantity: { type: Number, min: 1, max: 100, required: true },
          _id: false,
        },
      ],
      validate: [(items: unknown[]) => items.length <= 100, "A kit can hold up to 100 lines."],
    },
    // set on the first publish only, which is when parents are told
    publishedAt: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, strict: "throw" },
);
kitSchema.index({ school: 1, className: 1, year: 1 }, { unique: true, collation: SCHOOL_COLLATION });
kitSchema.index({ status: 1, year: -1 });

export const SchoolKit = mongoose.models.SchoolKit || mongoose.model("SchoolKit", kitSchema);

/** Money paid towards a family's tab, recorded by the store. A wrong entry is voided, never deleted. */
const tabPaymentSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: "Family", required: true },
    amountPaise: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
    method: { type: String, enum: ["cash", "upi"], required: true },
    reference: { type: String, trim: true, maxlength: 80, default: "" },
    // one form, one payment, however many times it is sent
    idempotencyKey: { type: String, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    voidedAt: Date,
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidReason: String,
  },
  { timestamps: true, strict: "throw" },
);
tabPaymentSchema.index({ idempotencyKey: 1 }, { unique: true });
tabPaymentSchema.index({ familyId: 1, createdAt: -1 });

export const TabPayment = mongoose.models.TabPayment || mongoose.model("TabPayment", tabPaymentSchema);
