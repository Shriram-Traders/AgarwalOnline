import mongoose, { Schema } from "mongoose";
import { roles } from "../auth/permissions";
import { GST_RATES, HSN_RE } from "../tax/gst";
import { clearsShopCache } from "./shop-cache";
const opts = { timestamps: true, strict: "throw" as const };
const ref = (name: string) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required: true,
});
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    // optional: people who join with Google have no number until they add one
    phone: String,
    email: String,
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    passwordHash: { type: String, select: false },
    roles: {
      type: [{ type: String, enum: roles }],
      default: () => ["customer"],
    },
    active: { type: Boolean, default: true },
    locale: { type: String, enum: ["en", "mr"], default: "en" },
    preferredPaymentMethod: {
      type: String,
      enum: ["cod", "razorpay"],
      default: "cod",
    },
    substitutionPreference: {
      type: String,
      enum: ["contact", "best-match", "no-substitutions"],
      default: "contact",
    },
    // one notification about items left in the basket (lib/commerce/basket-reminder.ts); off in Edit profile
    basketReminders: { type: Boolean, default: true },
    basketRemindedAt: Date,
    defaultAddressId: { type: Schema.Types.ObjectId, ref: "Address" },
  },
  opts,
);
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } },
);
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
userSchema.index({ roles: 1, active: 1, createdAt: -1 });
const otpSchema = new Schema(
  {
    subjectHash: { type: String, required: true },
    purpose: { type: String, enum: ["login", "delivery"], required: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    consumedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  opts,
);
otpSchema.index({ subjectHash: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const rateSchema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  opts,
);
rateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const localized = {
  en: { type: String, required: true },
  mr: { type: String, required: true },
};
const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: localized,
    symbol: String,
    /**
     * The sections this shelf shows under: Pens under Stationery and under Office. A section is
     * simply a category some shelf names here, and has none of its own (two levels, no deeper).
     */
    parentIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    /**
     * The old "Inside another category" box. The shop never showed it, and the live data has shelves
     * that hold products set inside one another (Pencils inside School Essentials), which the
     * category/subcategory grouping can't use, so nothing reads it any more. Cleared on the next save.
     */
    parentId: { type: Schema.Types.ObjectId, ref: "Category" },
  },
  opts,
);
/** The ids of the categories a subcategory sits in. The old single `parentId` is ignored on purpose (see above). */
export const parentsOf = (category: { parentIds?: unknown[] | null }): string[] => (category.parentIds ?? []).map(String);
const productSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: localized,
    description: localized,
    brand: String,
    categoryId: ref("Category"),
    categorySlug: { type: String, required: true },
    /**
     * Other shelves it also shows on, by slug (a pen gift set on Pens and on Party and Gifting).
     * `categorySlug` stays its own shelf: the breadcrumb, the web address and its icon follow that one.
     */
    alsoOn: [String],
    /** Another shop that supplies it ("Provided by …"); missing means our own stock. Agarwal still sells it. */
    providerId: { type: Schema.Types.ObjectId, ref: "Provider" },
    aliases: [String],
    image: String,
    images: [String],
    highlights: [localized],
    dietaryTags: [String],
    specifications: [
      {
        label: localized,
        value: localized,
        _id: false,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "published", "rejected"],
      default: "draft",
    },
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    /**
     * Who sees it. Shoppers: missing counts as yes, so products from before schools existed
     * stay in the shop. Schools: only when ticked.
     */
    showToCustomers: { type: Boolean, default: true },
    showToSchools: { type: Boolean, default: false },
    /** Printed on school quotations; each quotation line starts with these and can change them. */
    gstRatePercent: { type: Number, enum: [...GST_RATES] },
    hsnCode: { type: String, match: HSN_RE },
    /** Set when it was deleted: kept for past orders, gone from everywhere else (catalog/deleted.ts). */
    deletedAt: Date,
  },
  opts,
);
productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ status: 1, showToSchools: 1 });
productSchema.index({ providerId: 1 }, { sparse: true });
const variantSchema = new Schema(
  {
    productId: ref("Product"),
    sku: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    unit: {
      type: String,
      enum: ["piece", "kg", "g", "l", "ml"],
      required: true,
    },
    packQuantity: { type: Number, min: 0.001, required: true },
    pricePaise: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    mrpPaise: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    maxQuantity: {
      type: Number,
      min: 1,
      default: 10,
      validate: Number.isSafeInteger,
    },
    /** A hidden pack stays on past orders but can't be bought. Missing means active (older packs). */
    active: { type: Boolean, default: true },
    /** The expected price schools see, before GST. Missing means "price on quotation". */
    schoolPricePaise: { type: Number, min: 1, validate: Number.isSafeInteger },
    /**
     * What the shop paid for one pack: owners only, for profit. Never read unless asked for with
     * "+costPaise", so no page, list or shopper's browser gets it by accident.
     */
    costPaise: { type: Number, min: 0, validate: Number.isSafeInteger, select: false },
    /** Set when it was deleted: kept for past orders, gone from everywhere else (catalog/deleted.ts). */
    deletedAt: Date,
  },
  opts,
);
// a product's packs: the product page, stock import and catalog editing look them up by product
variantSchema.index({ productId: 1 });
const inventorySchema = new Schema(
  {
    variantId: { ...ref("ProductVariant"), unique: true },
    onHand: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    reserved: {
      type: Number,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },
    /** Running low once fewer than this can be sold; missing means the shop default (low-stock.ts), 0 never warns. */
    alertBelow: { type: Number, min: 0, max: 100000, validate: Number.isSafeInteger },
  },
  opts,
);
const areaSchema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    pincodes: [String],
    enabled: { type: Boolean, default: false },
    feePaise: { type: Number, min: 0, default: 3000 },
    codEnabled: { type: Boolean, default: true },
    codLimitPaise: { type: Number, default: 500000 },
  },
  opts,
);
const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    target: String,
    details: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { strict: "throw" },
);
auditSchema.index({ actorId: 1, at: -1 });
auditSchema.index({ action: 1, at: -1 });
auditSchema.index({ at: -1 });
// what shoppers browse is kept in memory for a minute (shop-cache.ts); a write to any of it empties that
for (const schema of [categorySchema, productSchema, variantSchema, areaSchema]) clearsShopCache(schema);
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const OTPChallenge =
  mongoose.models.OTPChallenge || mongoose.model("OTPChallenge", otpSchema);
export const RateLimit =
  mongoose.models.RateLimit || mongoose.model("RateLimit", rateSchema);
export const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);
export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
export const ProductVariant =
  mongoose.models.ProductVariant ||
  mongoose.model("ProductVariant", variantSchema);
export const InventoryItem =
  mongoose.models.InventoryItem ||
  mongoose.model("InventoryItem", inventorySchema);
export const ServiceArea =
  mongoose.models.ServiceArea || mongoose.model("ServiceArea", areaSchema);
export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
const synonymSchema = new Schema(
  {
    key: { type: String, unique: true, required: true },
    mappingType: { type: String, enum: ["equivalent"], default: "equivalent" },
    synonyms: { type: [String], required: true },
    updatedBy: ref("User"),
  },
  opts,
);
clearsShopCache(synonymSchema);
export const SearchSynonym =
  mongoose.models.SearchSynonym ||
  mongoose.model("SearchSynonym", synonymSchema);
