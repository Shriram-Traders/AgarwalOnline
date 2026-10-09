import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import {
  User,
  Product,
  ProductVariant,
  Category,
  InventoryItem,
  AuditLog,
} from "../db/models";
import { InventoryMovement, SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, hasPermission, type Permission, type Role } from "../auth/permissions";
import { notify } from "../engagement/service";
import { log } from "../logger";
import { ApprovalRequest, ApprovalHistory } from "./models";
import { gstRateField, hsnField, optionalField } from "../tax/gst";
import { UploadedEvidence } from "../evidence/models";
import { photoFields, photoList } from "../catalog/photos";

/** Photos chosen for a product waiting for approval are kept this long; a rejected request's then go. */
const PENDING_PHOTO_DAYS = 60;

/** A school price is optional and set before GST; a blank box means "price on quotation". */
const schoolPriceField = optionalField(z.coerce.number().int().min(1).max(10000000));
async function authorize(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], permission);
  return user;
}
export const productInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    nameEn: z.string().trim().min(2).max(100),
    nameMr: z.string().trim().min(2).max(100),
    descriptionEn: z.string().trim().min(5).max(2000),
    descriptionMr: z.string().trim().min(5).max(2000),
    brand: z.string().trim().max(60),
    categoryId: objectId,
    aliases: z.string().max(1000),
    sku: z
      .string()
      .regex(/^[A-Za-z\d-]+$/)
      .max(60),
    label: z.string().min(1).max(40),
    unit: z.enum(["piece", "kg", "g", "l", "ml"]),
    packQuantity: z.coerce.number().positive().max(100000),
    pricePaise: z.coerce.number().int().positive().max(10000000),
    mrpPaise: z.coerce.number().int().positive().max(10000000),
    stock: z.coerce.number().int().min(0).max(100000),
    // requests made before schools existed have none of these, and publish as shop-only
    showToCustomers: z.boolean().default(true),
    showToSchools: z.boolean().default(false),
    gstRatePercent: optionalField(gstRateField),
    hsnCode: optionalField(hsnField),
    schoolPricePaise: schoolPriceField,
    // in order, the first is the cover; requests made before photos could be added have none
    images: photoList.default([]),
  })
  .refine((d) => d.pricePaise <= d.mrpPaise, {
    message: "Price must not exceed MRP",
  })
  .refine((d) => d.showToCustomers || d.showToSchools, {
    message: "Tick Customers, Schools or both, so somebody can see the product.",
  });
export const variantInput = z
  .object({
    productId: objectId,
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z\d-]+$/)
      .max(60),
    label: z.string().trim().min(1).max(40),
    unit: z.enum(["piece", "kg", "g", "l", "ml"]),
    packQuantity: z.coerce.number().positive().max(100000),
    pricePaise: z.coerce.number().int().positive().max(10000000),
    mrpPaise: z.coerce.number().int().positive().max(10000000),
    maxQuantity: z.coerce.number().int().min(1).max(100),
    stock: z.coerce.number().int().min(0).max(100000),
    schoolPricePaise: schoolPriceField,
  })
  .refine((value) => value.pricePaise <= value.mrpPaise, {
    message: "Price must not exceed MRP.",
  });

/**
 * A shop run by one owner has nobody else to approve that owner's changes, so they apply at
 * once (still recorded as a request the owner approved). With two or more owners, a second
 * owner looks first, as before.
 */
async function soleOwner(actorId: string, session?: mongoose.ClientSession) {
  const actor = await User.findById(actorId).select("roles").session(session ?? null);
  if (!actor?.roles.includes("super-admin")) return false;
  const owners = await User.countDocuments({ roles: "super-admin", active: true }).session(session ?? null);
  return owners === 1;
}
const SOLE_OWNER_NOTE = "Applied at once: you are the only owner.";

/** Records a new request. For a lone owner it is approved and published in the same step; returns whether it is live. */
async function openRequest(
  fields: { kind: string; targetId: unknown; before?: unknown; after: unknown; reason?: string },
  actorId: string,
  session: mongoose.ClientSession,
) {
  const [request] = await ApprovalRequest.create([{ ...fields, requesterId: actorId }], { session });
  await ApprovalHistory.create(
    [{ requestId: request._id, actorId, previous: "draft", next: "pending", comment: fields.reason }],
    { session },
  );
  if (!(await soleOwner(actorId, session))) return false;
  request.state = "approved";
  request.reviewerId = actorId;
  request.reviewedAt = new Date();
  request.reason = SOLE_OWNER_NOTE;
  await request.save({ session });
  await ApprovalHistory.create(
    [{ requestId: request._id, actorId, previous: "pending", next: "approved", comment: SOLE_OWNER_NOTE }],
    { session },
  );
  await publish(request, actorId, session);
  return true;
}

/** One pending change per pack at a time; say so instead of failing on the database's duplicate check. */
async function assertNothingPending(kind: string, targetId: unknown, session: mongoose.ClientSession) {
  if (await ApprovalRequest.exists({ kind, targetId, state: "pending" }).session(session))
    throw Error(
      `A ${kind === "price" ? "price" : "stock"} change for this pack is already waiting for approval. Withdraw it or wait for the decision.`,
    );
}

/** Taken web addresses and SKUs are caught when the request is made, not later at approval. */
async function assertFree(fields: { slug?: string; sku?: string }, session: mongoose.ClientSession) {
  if (fields.slug) {
    const taken =
      (await Product.exists({ slug: fields.slug }).session(session)) ||
      (await ApprovalRequest.exists({ kind: "product", state: "pending", "after.slug": fields.slug }).session(session));
    if (taken) throw Error(`That web address (${fields.slug}) is already used. Pick another one.`);
  }
  if (fields.sku) {
    const taken =
      (await ProductVariant.exists({ sku: fields.sku }).session(session)) ||
      (await ApprovalRequest.exists({
        kind: { $in: ["product", "variant"] },
        state: "pending",
        "after.sku": fields.sku,
      }).session(session));
    if (taken) throw Error(`That SKU (${fields.sku}) is already used. Pick another one.`);
  }
}

/** Only an owner prices for schools, so only an owner can put a school price on a new pack. */
function assertSchoolPriceAllowed(actor: { roles: unknown }, schoolPricePaise?: number) {
  if (schoolPricePaise != null && !hasPermission(actor.roles as Role[], "settings:write"))
    throw Error("Only an owner can set a school price. Leave it blank; the owner can add it later.");
}

export async function submitProduct(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "approval:request");
  const data = productInput.parse(input);
  assertSchoolPriceAllowed(actor, data.schoolPricePaise);
  if (!(await Category.exists({ _id: data.categoryId })))
    throw Error("Select a category.");
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    await assertFree({ slug: data.slug, sku: data.sku }, session);
    // the photos chosen for it wait as long as the request might
    if (data.images.length)
      await UploadedEvidence.updateMany(
        { url: { $in: data.images }, purpose: "product-draft" },
        { $set: { expiresAt: new Date(Date.now() + PENDING_PHOTO_DAYS * 86400 * 1000) } },
        { session },
      );
    live = await openRequest(
      { kind: "product", targetId: new mongoose.Types.ObjectId(), after: data },
      actorId,
      session,
    );
  });
  return { live };
}
/** A new pack size follows the same approval as a price change: it puts a price in the shop. */
export async function submitVariant(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "approval:request");
  const data = variantInput.parse(input);
  assertSchoolPriceAllowed(actor, data.schoolPricePaise);
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    if (!(await Product.exists({ _id: data.productId }).session(session)))
      throw Error("Product not found.");
    await assertFree({ sku: data.sku }, session);
    live = await openRequest(
      { kind: "variant", targetId: new mongoose.Types.ObjectId(), after: data },
      actorId,
      session,
    );
  });
  return { live };
}
export async function requestPrice(actorId: string, input: unknown) {
  await authorize(actorId, "approval:request");
  const data = z
    .object({
      variantId: objectId,
      pricePaise: z.coerce.number().int().positive(),
      mrpPaise: z.coerce.number().int().positive(),
    })
    .refine((d) => d.pricePaise <= d.mrpPaise, {
      message: "Price must not exceed MRP.",
      path: ["pricePaise"],
    })
    .parse(input);
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findById(data.variantId).session(
      session,
    );
    if (!variant) throw Error("This variant is unavailable.");
    await assertNothingPending("price", variant._id, session);
    live = await openRequest(
      {
        kind: "price",
        targetId: variant._id,
        before: { pricePaise: variant.pricePaise, mrpPaise: variant.mrpPaise },
        after: { pricePaise: data.pricePaise, mrpPaise: data.mrpPaise },
      },
      actorId,
      session,
    );
  });
  return { live };
}
async function applyStock(
  actorId: string,
  variantId: unknown,
  delta: number,
  session: mongoose.ClientSession,
) {
  const stock = await InventoryItem.updateOne(
    { variantId, $expr: { $gte: [{ $add: ["$onHand", delta] }, "$reserved"] } },
    { $inc: { onHand: delta } },
    { session },
  );
  if (stock.modifiedCount !== 1)
    throw Error("This adjustment would reduce stock below reservations.");
  await InventoryMovement.create(
    [{ variantId, actorId, quantity: delta, kind: "adjust" }],
    { session },
  );
}
/** Small changes apply at once; large ones wait for an owner (or apply at once for a lone owner). */
export async function adjustStock(actorId: string, input: unknown) {
  await authorize(actorId, "inventory:adjust");
  const data = z
    .object({
      variantId: objectId,
      delta: z.coerce
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(input);
  let outcome: "applied" | "pending" = "applied";
  await mongoose.connection.transaction(async (session) => {
    const setting = await SystemSetting.findOne({
      key: "large-stock-threshold",
    }).session(session);
    const threshold = z
      .number()
      .int()
      .min(1)
      .parse(setting?.value ?? 100);
    const stock = await InventoryItem.findOne({
      variantId: data.variantId,
    }).session(session);
    if (!stock) throw Error("This stock record is unavailable.");
    if (Math.abs(data.delta) >= threshold) {
      await assertNothingPending("stock", data.variantId, session);
      const live = await openRequest(
        {
          kind: "stock",
          targetId: data.variantId,
          before: { onHand: stock.onHand },
          after: { delta: data.delta },
          reason: data.reason,
        },
        actorId,
        session,
      );
      outcome = live ? "applied" : "pending";
    } else {
      await applyStock(actorId, data.variantId, data.delta, session);
      await AuditLog.create(
        [
          {
            actorId,
            action: "inventory.adjust",
            target: data.variantId,
            details: { delta: data.delta, reason: data.reason },
          },
        ],
        { session },
      );
    }
  });
  return { outcome };
}
async function createPack(
  data: z.infer<typeof variantInput> | z.infer<typeof productInput>,
  productId: unknown,
  variantId: unknown,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const [v] = await ProductVariant.create(
    [
      {
        _id: variantId,
        productId,
        sku: data.sku,
        label: data.label,
        unit: data.unit,
        packQuantity: data.packQuantity,
        pricePaise: data.pricePaise,
        mrpPaise: data.mrpPaise,
        ...("maxQuantity" in data ? { maxQuantity: data.maxQuantity } : {}),
        ...(data.schoolPricePaise != null ? { schoolPricePaise: data.schoolPricePaise } : {}),
      },
    ],
    { session },
  );
  await InventoryItem.create([{ variantId: v._id, onHand: data.stock, reserved: 0 }], { session });
  await InventoryMovement.create(
    [{ variantId: v._id, actorId, quantity: data.stock, kind: "adjust" }],
    { session },
  );
  return v;
}
async function publish(
  request: mongoose.Document & Record<string, unknown>,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const kind = String(request.kind);
  const after = request.after as Record<string, unknown>;
  const before = request.before as Record<string, unknown> | undefined;
  if (kind === "product") {
    const data = productInput.parse(after);
    const category = await Category.findById(data.categoryId).session(session);
    if (!category) throw Error("Category no longer exists");
    const [p] = await Product.create(
      [
        {
          _id: request.targetId,
          slug: data.slug,
          name: { en: data.nameEn, mr: data.nameMr },
          description: { en: data.descriptionEn, mr: data.descriptionMr },
          brand: data.brand,
          categoryId: category._id,
          categorySlug: category.slug,
          aliases: data.aliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          status: "published",
          showToCustomers: data.showToCustomers,
          showToSchools: data.showToSchools,
          ...(data.gstRatePercent != null ? { gstRatePercent: data.gstRatePercent } : {}),
          ...(data.hsnCode ? { hsnCode: data.hsnCode } : {}),
          ...(data.images.length ? photoFields(data.images) : {}),
        },
      ],
      { session },
    );
    // the photos chosen on Add product become the product's own, shown to everyone and kept for good
    if (data.images.length)
      await UploadedEvidence.updateMany(
        { url: { $in: data.images }, purpose: "product-draft" },
        { $set: { purpose: "product", productId: p._id }, $unset: { expiresAt: 1 } },
        { session },
      );
    await createPack(data, p._id, new mongoose.Types.ObjectId(), actorId, session);
  } else if (kind === "variant") {
    const data = variantInput.parse(after);
    if (!(await Product.exists({ _id: data.productId }).session(session)))
      throw Error("Product not found.");
    await createPack(data, data.productId, request.targetId, actorId, session);
  } else if (kind === "price") {
    const result = await ProductVariant.updateOne(
      {
        _id: request.targetId,
        pricePaise: before?.pricePaise,
        mrpPaise: before?.mrpPaise,
      },
      { $set: { pricePaise: after.pricePaise, mrpPaise: after.mrpPaise } },
      { session, runValidators: true },
    );
    if (result.modifiedCount !== 1)
      throw Error("Prices changed since this request. Submit a fresh request.");
  } else {
    // the change is relative ("+100 delivered"), so sales in between don't make it wrong;
    // applyStock still refuses to take stock below what open orders hold
    await applyStock(actorId, request.targetId, Number(after.delta), session);
  }
  request.state = "published";
  request.publishedAt = new Date();
  await request.save({ session });
  await ApprovalHistory.create(
    [
      {
        requestId: request._id,
        actorId,
        previous: "approved",
        next: "published",
      },
    ],
    { session },
  );
  await AuditLog.create(
    [
      {
        actorId,
        action: `approval.publish.${kind}`,
        target: String(request.targetId),
        details: { before, after },
      },
    ],
    { session },
  );
}
const KIND_NAMES: Record<string, string> = {
  product: "new product",
  variant: "new pack size",
  price: "price change",
  stock: "stock change",
};
function describe(request: { kind: string; after: Record<string, unknown> }) {
  const what = KIND_NAMES[request.kind] ?? "change";
  return request.kind === "product" && request.after.nameEn
    ? `${what} “${String(request.after.nameEn)}”`
    : what;
}
export async function reviewApproval(actorId: string, input: unknown) {
  await authorize(actorId, "approval:review");
  const data = z
    .object({
      requestId: objectId,
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().trim().max(500),
      scheduledAt: z.string().optional(),
    })
    .parse(input);
  if (data.decision === "rejected" && data.comment.length < 5)
    throw Error("A rejection reason is required.");
  const scheduledAt = data.scheduledAt
    ? z.coerce.date().parse(data.scheduledAt)
    : undefined;
  let decided: { requesterId: unknown; kind: string; after: Record<string, unknown> } | null = null;
  await mongoose.connection.transaction(async (session) => {
    const request = await ApprovalRequest.findOne({
      _id: data.requestId,
      state: "pending",
    }).session(session);
    if (!request) throw Error("This request has already been reviewed.");
    if (String(request.requesterId) === actorId && !(await soleOwner(actorId, session)))
      throw Error("You cannot approve or reject your own request.");
    request.state = data.decision;
    request.reviewerId = actorId;
    request.reviewedAt = new Date();
    request.reason = data.comment;
    if (scheduledAt) request.scheduledAt = scheduledAt;
    await request.save({ session });
    await ApprovalHistory.create(
      [
        {
          requestId: request._id,
          actorId,
          previous: "pending",
          next: data.decision,
          comment: data.comment,
        },
      ],
      { session },
    );
    if (
      data.decision === "approved" &&
      (!scheduledAt || scheduledAt.getTime() <= Date.now())
    )
      await publish(request, actorId, session);
    decided = { requesterId: request.requesterId, kind: request.kind, after: request.after };
  });
  // the person who asked finds out, instead of checking back
  const result = decided as { requesterId: unknown; kind: string; after: Record<string, unknown> } | null;
  if (result && String(result.requesterId) !== actorId) {
    const what = describe(result);
    await notify({
      userId: result.requesterId,
      type: "system",
      title:
        data.decision === "rejected"
          ? `Your ${what} was not approved`
          : scheduledAt && scheduledAt.getTime() > Date.now()
            ? `Your ${what} was approved for later`
            : `Your ${what} is live`,
      body:
        data.decision === "rejected"
          ? `Reason: ${data.comment}`
          : data.comment || "An owner approved it.",
      href: result.kind === "stock" ? "/admin/inventory" : "/admin/products",
    }).catch((error) => log("warn", "approval.notify-failed", { error }));
  }
}
/** The person who asked (or an owner) takes back a change that is still waiting. */
export async function withdrawRequest(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "profile:own");
  const requestId = objectId.parse(input);
  await mongoose.connection.transaction(async (session) => {
    const request = await ApprovalRequest.findOne({ _id: requestId, state: "pending" }).session(session);
    if (!request) throw Error("This request has already been reviewed.");
    const mayReview = hasPermission(actor.roles as Role[], "approval:review");
    if (String(request.requesterId) !== actorId && !mayReview)
      throw Error("Only the person who asked, or an owner, can withdraw this request.");
    request.state = "withdrawn";
    await request.save({ session });
    await ApprovalHistory.create(
      [{ requestId: request._id, actorId, previous: "pending", next: "withdrawn" }],
      { session },
    );
  });
}
/**
 * Publishes approved changes whose time has come. Each one is handled on its own: one that can't
 * be applied any more (a price changed meanwhile, the approver left) is marked failed with the
 * reason and the people involved are told, instead of stopping every later change.
 */
export async function publishScheduled() {
  await connectDB();
  const requests = await ApprovalRequest.find({
    state: "approved",
    scheduledAt: { $lte: new Date() },
  }).limit(100);
  let published = 0;
  for (const r of requests) {
    try {
      await authorize(String(r.reviewerId), "approval:review");
      await mongoose.connection.transaction(async (session) => {
        const current = await ApprovalRequest.findOne({
          _id: r._id,
          state: "approved",
          scheduledAt: { $lte: new Date() },
        }).session(session);
        if (current) await publish(current, String(current.reviewerId), session);
      });
      published++;
    } catch (error) {
      const reason =
        error instanceof Error && /^(UNAUTHENTICATED|FORBIDDEN)$/.test(error.message)
          ? "The owner who approved it can no longer approve changes."
          : error instanceof Error
            ? error.message
            : "It could not be applied.";
      await ApprovalRequest.updateOne(
        { _id: r._id, state: "approved" },
        { $set: { state: "failed", failureReason: reason } },
      );
      await ApprovalHistory.create({
        requestId: r._id,
        actorId: r.reviewerId,
        previous: "approved",
        next: "failed",
        comment: reason,
      });
      log("warn", "approval.scheduled-failed", { requestId: String(r._id), reason });
      for (const userId of new Set([String(r.requesterId), String(r.reviewerId)]))
        await notify({
          userId,
          type: "system",
          title: `A scheduled ${describe(r)} could not be applied`,
          body: `${reason} Send a fresh request if it is still needed.`,
          href: "/super-admin/approvals",
        }).catch(() => undefined);
    }
  }
  return published;
}
