import mongoose, { Schema } from "mongoose";

/*
 * Schools that buy in bulk, the people who represent them, their shared quote basket and the
 * quotations the owner sends back. A representative is an ordinary customer account plus a
 * membership row here; nothing about how they sign in changes.
 */
const opts = { timestamps: true, strict: "throw" as const };
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const optionalRef = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });
const paise = { type: Number, min: 0, validate: Number.isSafeInteger };

const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contactName: String,
    phone: String,
    email: String,
    address: String,
    pin: String,
    /** Two-digit GST state code; decides CGST + SGST or IGST on its quotations. */
    stateCode: String,
    gstin: String,
    /** The owner's own notes; never shown to the school. */
    notes: String,
    /** The secret in the school's join link; a new one stops the old link. */
    joinToken: { type: String, required: true },
    joinOpen: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    createdBy: ref("User"),
  },
  opts,
);
schoolSchema.index({ joinToken: 1 }, { unique: true });
schoolSchema.index({ active: 1, name: 1 });

const memberSchema = new Schema(
  {
    schoolId: ref("School"),
    userId: ref("User"),
    addedBy: ref("User"),
    /** Added by the owner, or approved after asking through the join link. */
    via: { type: String, enum: ["owner", "link"], required: true },
  },
  opts,
);
memberSchema.index({ schoolId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1 });

const accessRequestSchema = new Schema(
  {
    schoolId: ref("School"),
    userId: ref("User"),
    state: { type: String, enum: ["pending", "approved", "declined", "withdrawn"], default: "pending" },
    message: String,
    reviewerId: optionalRef("User"),
    reviewedAt: Date,
    reason: String,
  },
  opts,
);
// one open request per person per school
accessRequestSchema.index(
  { schoolId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { state: "pending" } },
);
accessRequestSchema.index({ state: 1, createdAt: 1 });
accessRequestSchema.index({ userId: 1, createdAt: -1 });

const basketItemSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    quantity: { type: Number, required: true, min: 1, max: 100000, validate: Number.isSafeInteger },
    addedBy: ref("User"),
  },
  { _id: false },
);
const quoteBasketSchema = new Schema(
  {
    /** One basket per school, shared by all its representatives. */
    schoolId: ref("School"),
    items: { type: [basketItemSchema], default: [] },
    /** Goes up with every change, so a request is never sent from a basket someone just changed. */
    rev: { type: Number, default: 0 },
  },
  opts,
);
quoteBasketSchema.index({ schoolId: 1 }, { unique: true });

const requestItemSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    productId: ref("Product"),
    name: { type: String, required: true },
    label: { type: String, required: true },
    sku: String,
    quantity: { type: Number, required: true, min: 1 },
    schoolPricePaise: paise,
    shopPricePaise: { ...paise, required: true },
    gstRatePercent: Number,
    hsnCode: String,
    addedBy: optionalRef("User"),
  },
  { _id: false },
);
const draftLineSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    name: { type: String, required: true },
    label: { type: String, required: true },
    hsnCode: String,
    gstRatePercent: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPricePaise: { ...paise, required: true },
  },
  { _id: false },
);
const draftSchema = new Schema(
  {
    lines: { type: [draftLineSchema], default: [] },
    discountType: { type: String, enum: ["none", "percent", "amount"], default: "none" },
    /** A whole percent, or paise. */
    discountValue: { type: Number, default: 0, min: 0 },
    validUntil: { type: String, required: true },
    note: String,
    updatedBy: ref("User"),
    updatedAt: { type: Date, required: true },
    /** Set once this draft is sent; a further send needs a change first. */
    sentAsVersion: Number,
  },
  { _id: false },
);
const partySchema = new Schema(
  {
    name: String,
    gstin: String,
    address: String,
    pin: String,
    stateCode: String,
    phone: String,
    email: String,
    terms: String,
  },
  { _id: false },
);
const versionLineSchema = new Schema(
  {
    variantId: ref("ProductVariant"),
    name: { type: String, required: true },
    label: { type: String, required: true },
    hsnCode: String,
    gstRatePercent: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unitPricePaise: { ...paise, required: true },
    amountPaise: { ...paise, required: true },
    discountPaise: { ...paise, required: true },
    taxablePaise: { ...paise, required: true },
  },
  { _id: false },
);
const taxRowSchema = new Schema(
  {
    ratePercent: { type: Number, required: true },
    taxablePaise: { ...paise, required: true },
    cgstPaise: { ...paise, required: true },
    sgstPaise: { ...paise, required: true },
    igstPaise: { ...paise, required: true },
  },
  { _id: false },
);
const responseSchema = new Schema(
  {
    kind: { type: String, enum: ["accepted", "changes"], required: true },
    note: String,
    by: ref("User"),
    at: { type: Date, required: true },
  },
  { _id: false },
);
/** A sent quotation, frozen: later price or detail changes never alter what the school saw. */
const versionSchema = new Schema(
  {
    version: { type: Number, required: true },
    sentAt: { type: Date, required: true },
    sentBy: ref("User"),
    validUntil: { type: String, required: true },
    note: String,
    supply: { type: String, enum: ["intra", "inter"], required: true },
    seller: partySchema,
    buyer: partySchema,
    lines: { type: [versionLineSchema], default: [] },
    taxes: { type: [taxRowSchema], default: [] },
    subtotalPaise: { ...paise, required: true },
    discountPaise: { ...paise, required: true },
    discountLabel: String,
    taxablePaise: { ...paise, required: true },
    cgstPaise: { ...paise, required: true },
    sgstPaise: { ...paise, required: true },
    igstPaise: { ...paise, required: true },
    totalPaise: { ...paise, required: true },
    emailed: { sent: Number, noEmail: Number, failed: Number },
    response: responseSchema,
  },
  { _id: false },
);
const quoteRequestSchema = new Schema(
  {
    number: { type: String, required: true },
    schoolId: ref("School"),
    requestedBy: ref("User"),
    note: String,
    neededBy: String,
    status: {
      type: String,
      enum: ["requested", "quoted", "changes-requested", "accepted", "closed"],
      default: "requested",
    },
    /** What the school asked for, as it stood when they sent it. */
    items: { type: [requestItemSchema], default: [] },
    draft: draftSchema,
    currentVersion: { type: Number, default: 0 },
    versions: { type: [versionSchema], default: [] },
    closedReason: String,
    closedBy: optionalRef("User"),
    closedAt: Date,
  },
  opts,
);
quoteRequestSchema.index({ number: 1 }, { unique: true });
quoteRequestSchema.index({ schoolId: 1, createdAt: -1 });
quoteRequestSchema.index({ status: 1, updatedAt: -1 });

export const School = mongoose.models.School || mongoose.model("School", schoolSchema);
export const SchoolMember = mongoose.models.SchoolMember || mongoose.model("SchoolMember", memberSchema);
export const SchoolAccessRequest =
  mongoose.models.SchoolAccessRequest || mongoose.model("SchoolAccessRequest", accessRequestSchema);
export const QuoteBasket = mongoose.models.QuoteBasket || mongoose.model("QuoteBasket", quoteBasketSchema);
export const QuoteRequest = mongoose.models.QuoteRequest || mongoose.model("QuoteRequest", quoteRequestSchema);
