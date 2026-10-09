import mongoose from "mongoose";
import { z } from "zod";
import { assertPermission, type Permission, type Role } from "../auth/permissions";
import { connectDB } from "../db/connect";
import {
  AuditLog,
  Category,
  Product,
  ProductVariant,
  User,
} from "../db/models";
import { objectId } from "../commerce/service";
import { gstRateField, hsnField, optionalField } from "../tax/gst";
import { orderedPhotos, photoFields, photoList } from "./photos";

async function authorize(actorId: string, permission: Permission = "catalog:write") {
  await connectDB();
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], permission);
}

const categoryInput = z.object({
  categoryId: objectId.optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  nameEn: z.string().trim().min(2).max(80),
  nameMr: z.string().trim().min(2).max(80),
  symbol: z.string().trim().max(12).default(""),
  parentId: z.union([objectId, z.literal("")]).optional(),
});

export async function saveCategory(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = categoryInput.parse(input);
  if (data.parentId && data.parentId === data.categoryId)
    throw Error("A category cannot be its own parent.");
  await mongoose.connection.transaction(async (session) => {
    if (
      data.parentId &&
      !(await Category.exists({ _id: data.parentId }).session(session))
    )
      throw Error("Parent category not found.");
    const payload = {
      slug: data.slug,
      name: { en: data.nameEn, mr: data.nameMr },
      symbol: data.symbol,
      ...(data.parentId ? { parentId: data.parentId } : { parentId: null }),
    };
    const before = data.categoryId
      ? await Category.findById(data.categoryId).session(session).lean()
      : null;
    const category = data.categoryId
      ? await Category.findOneAndUpdate(
          { _id: data.categoryId },
          { $set: payload },
          { new: true, runValidators: true, session },
        )
      : (await Category.create([payload], { session }))[0];
    if (!category) throw Error("Category not found.");
    if (before && before.slug !== data.slug)
      await Product.updateMany(
        { categoryId: category._id },
        { $set: { categorySlug: data.slug } },
        { session },
      );
    await AuditLog.create(
      [
        {
          actorId,
          action: data.categoryId ? "category.update" : "category.create",
          target: String(category._id),
          details: { before, after: payload },
        },
      ],
      { session },
    );
  });
}

export async function updateProductMetadata(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      productId: objectId,
      nameEn: z.string().trim().min(2).max(100),
      nameMr: z.string().trim().min(2).max(100),
      descriptionEn: z.string().trim().min(5).max(2000),
      descriptionMr: z.string().trim().min(5).max(2000),
      brand: z.string().trim().max(60),
      categoryId: objectId,
      aliases: z.string().max(1000),
      highlightsEn: z.string().max(2000).default(""),
      highlightsMr: z.string().max(2000).default(""),
      dietaryTags: z.string().max(1000).default(""),
      specifications: z.string().max(5000).default(""),
      featured: z.boolean(),
      bestseller: z.boolean(),
      // printed on school quotations; a blank box clears it
      gstRatePercent: optionalField(gstRateField),
      hsnCode: optionalField(hsnField),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findById(data.productId).session(session);
    const category = await Category.findById(data.categoryId).session(session);
    if (!product || !category) throw Error("Product or category not found.");
    const before = product.toObject();
    const enHighlights = data.highlightsEn.split("\n").map((item) => item.trim()).filter(Boolean);
    const mrHighlights = data.highlightsMr.split("\n").map((item) => item.trim()).filter(Boolean);
    const specifications = data.specifications
      .split("\n")
      .map((row) => row.split("|").map((part) => part.trim()))
      .filter((parts) => parts.length === 4 && parts.every(Boolean))
      .map(([labelEn, labelMr, valueEn, valueMr]) => ({
        label: { en: labelEn, mr: labelMr },
        value: { en: valueEn, mr: valueMr },
      }));
    const after = {
      name: { en: data.nameEn, mr: data.nameMr },
      description: { en: data.descriptionEn, mr: data.descriptionMr },
      brand: data.brand,
      categoryId: category._id,
      categorySlug: category.slug,
      aliases: [
        ...new Set(
          data.aliases
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      highlights: Array.from({ length: Math.max(enHighlights.length, mrHighlights.length) }, (_, index) => ({
        en: enHighlights[index] ?? mrHighlights[index] ?? "",
        mr: mrHighlights[index] ?? enHighlights[index] ?? "",
      })).filter((item) => item.en && item.mr),
      dietaryTags: [...new Set(data.dietaryTags.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))],
      specifications,
      featured: data.featured,
      bestseller: data.bestseller,
      gstRatePercent: data.gstRatePercent,
      hsnCode: data.hsnCode,
    };
    product.set(after);
    await product.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "product.metadata.update",
          target: data.productId,
          details: { before, after },
        },
      ],
      { session },
    );
  });
}

/**
 * A product's photos in a new order, with some removed or links added: the list as it now
 * stands, the first being the cover. Uploads join the list as they happen (storeEvidence).
 */
export async function saveProductPhotos(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z.object({ productId: objectId, images: photoList }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findById(data.productId).session(session);
    if (!product) throw Error("Product not found.");
    const before = orderedPhotos(product);
    const fields = photoFields(data.images);
    product.images = fields.images;
    product.image = fields.image;
    await product.save({ session });
    await AuditLog.create(
      [{ actorId, action: "product.photos.update", target: data.productId, details: { before, after: fields.images } }],
      { session },
    );
  });
}

/**
 * Take a product out of the shop, or put it back. Hiding used to be a checkbox in the details form
 * that could never be undone; now both ways work, and showing needs at least one pack to sell.
 */
export async function setProductVisibility(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({ productId: objectId, visible: z.enum(["show", "hide"]) })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findById(data.productId).session(session);
    if (!product) throw Error("Product not found.");
    const status = data.visible === "show" ? "published" : "draft";
    if (product.status === status) return;
    if (
      status === "published" &&
      !(await ProductVariant.exists({ productId: product._id, active: { $ne: false } }).session(session))
    )
      throw Error("Product has no pack to sell yet. Add or show a pack first.");
    const before = product.status;
    product.status = status;
    await product.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: status === "published" ? "product.show" : "product.hide",
          target: data.productId,
          details: { before, after: status },
        },
      ],
      { session },
    );
  });
}

/**
 * Change a pack's name or per-order limit, or hide it (past orders keep it; nobody can buy it).
 * Price and stock still go through their own approval rules.
 */
export async function updateVariant(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      variantId: objectId,
      label: z.string().trim().min(1).max(40),
      maxQuantity: z.coerce.number().int().min(1).max(100),
      active: z.boolean(),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findById(data.variantId).session(session);
    if (!variant) throw Error("Pack not found.");
    const before = { label: variant.label, maxQuantity: variant.maxQuantity, active: variant.active !== false };
    variant.set({ label: data.label, maxQuantity: data.maxQuantity, active: data.active });
    await variant.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "variant.update",
          target: data.variantId,
          details: { before, after: { label: data.label, maxQuantity: data.maxQuantity, active: data.active } },
        },
      ],
      { session },
    );
  });
}

/**
 * Who sees a product: shoppers, schools or both. Taking it away from both is what Hide is for,
 * so at least one box stays ticked.
 */
export async function setProductAudience(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({ productId: objectId, showToCustomers: z.boolean(), showToSchools: z.boolean() })
    .refine((value) => value.showToCustomers || value.showToSchools, {
      message: "Tick Customers, Schools or both. To take it out of both, use Hide.",
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findById(data.productId).session(session);
    if (!product) throw Error("Product not found.");
    const before = { showToCustomers: product.showToCustomers !== false, showToSchools: product.showToSchools === true };
    const after = { showToCustomers: data.showToCustomers, showToSchools: data.showToSchools };
    if (before.showToCustomers === after.showToCustomers && before.showToSchools === after.showToSchools) return;
    product.set(after);
    await product.save({ session });
    await AuditLog.create(
      [{ actorId, action: "product.audience", target: data.productId, details: { before, after } }],
      { session },
    );
  });
}

/**
 * The price schools see for a pack, before GST. Only an owner sets it, because only an owner
 * prices school quotations; a blank box takes it off ("price on quotation").
 */
export async function setSchoolPrice(actorId: string, input: unknown) {
  await authorize(actorId, "settings:write");
  const data = z
    .object({
      variantId: objectId,
      schoolPricePaise: optionalField(z.coerce.number().int().min(1).max(10_000_000)),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findById(data.variantId).session(session);
    if (!variant) throw Error("Pack not found.");
    const before = variant.schoolPricePaise ?? null;
    const after = data.schoolPricePaise ?? null;
    if (before === after) return;
    variant.set({ schoolPricePaise: data.schoolPricePaise });
    await variant.save({ session });
    await AuditLog.create(
      [{ actorId, action: "variant.school-price", target: data.variantId, details: { before, after } }],
      { session },
    );
  });
}
