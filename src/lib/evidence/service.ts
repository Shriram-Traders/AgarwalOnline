import { createHash, randomUUID } from "node:crypto";
import { hasPermission, type Role } from "../auth/permissions";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, Product, User } from "../db/models";
import { Order } from "../commerce/models";
import { Complaint } from "../aftercare/models";
import { objectId } from "../commerce/service";
import { UploadedEvidence } from "./models";
import { getEnv } from "../env";
import { MAX_PHOTOS, orderedPhotos } from "../catalog/photos";

/** A photo chosen on Add product is kept this long unless the product is sent for approval. */
export const DRAFT_PHOTO_DAYS = 7;

const allowed = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function storeEvidence(
  actorId: string,
  input: {
    file: File;
    purpose: unknown;
    orderId?: unknown;
    complaintId?: unknown;
    productId?: unknown;
  },
) {
  await connectDB();
  const data = z
    .object({
      purpose: z.enum([
        "complaint",
        "packing",
        "delivery",
        "failed-delivery",
        "product",
        "product-draft",
      ]),
      orderId: objectId.optional(),
      complaintId: objectId.optional(),
      productId: objectId.optional(),
    })
    .parse({
      purpose: input.purpose,
      orderId: input.orderId || undefined,
      complaintId: input.complaintId || undefined,
      productId: input.productId || undefined,
    });
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  if (!(input.file instanceof File) || input.file.size < 1)
    throw Error("Choose a photograph.");
  // matches the 4 MB server-action body limit in next.config.ts, less room for the other form fields
  if (input.file.size > 3.5 * 1024 * 1024)
    throw Error("Photographs must be smaller than 3.5 MB. Please choose a smaller photo.");
  const extension = allowed.get(input.file.type);
  if (!extension) throw Error("Use a JPG, PNG or WebP photograph.");

  if (data.purpose === "complaint") {
    if (
      !actor.roles.includes("customer") ||
      !data.complaintId ||
      !(await Complaint.exists({ _id: data.complaintId, customerId: actorId }))
    )
      throw Error("FORBIDDEN");
  } else if (["delivery", "failed-delivery"].includes(data.purpose)) {
    if (
      !actor.roles.includes("delivery") ||
      !data.orderId ||
      !(await Order.exists({ _id: data.orderId, assignedTo: actorId }))
    )
      throw Error("FORBIDDEN");
  } else if (data.purpose === "packing") {
    if (!hasPermission(actor.roles as Role[], "packing:write") || !data.orderId)
      throw Error("FORBIDDEN");
  } else if (data.purpose === "product") {
    if (!hasPermission(actor.roles as Role[], "catalog:write") || !data.productId)
      throw Error("FORBIDDEN");
    const product = await Product.findById(data.productId).select("image images");
    if (!product) throw Error("Product not found.");
    if (orderedPhotos(product).length >= MAX_PHOTOS)
      throw Error(`Product already has ${MAX_PHOTOS} photos. Remove one before adding another.`);
  } else if (data.purpose === "product-draft") {
    // a photo for a product that doesn't exist yet: Add product
    if (!hasPermission(actor.roles as Role[], "catalog:write")) throw Error("FORBIDDEN");
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${Date.now()}-${randomUUID()}.${extension}`;
  let storageKey = key;
  let provider: "local" | "cloudinary" = "local";
  let url = "";
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `agarwal/${data.purpose}/${key.replace(`.${extension}`, "")}`;
    const signature = createHash("sha1")
      .update(
        `public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`,
      )
      .digest("hex");
    const body = new FormData();
    body.set(
      "file",
      new Blob([new Uint8Array(bytes)], { type: input.file.type }),
      key,
    );
    body.set("api_key", process.env.CLOUDINARY_API_KEY);
    body.set("timestamp", String(timestamp));
    body.set("public_id", publicId);
    body.set("signature", signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body, signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok) throw Error("Image storage is temporarily unavailable.");
    const result = z
      .object({ secure_url: z.string().url(), public_id: z.string() })
      .parse(await response.json());
    provider = "cloudinary";
    storageKey = result.public_id;
    url = result.secure_url;
  } else {
    const directory = path.join(process.cwd(), ".local", "uploads");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, key), bytes, { flag: "wx" });
  }
  const evidence = await UploadedEvidence.create({
    ownerId: actorId,
    ...data,
    provider,
    storageKey,
    url: url || "pending-local-url",
    mime: input.file.type,
    size: input.file.size,
    sha256,
    // product photos are catalogue content, not evidence: they must never expire; a draft one
    // goes away unless the product it was chosen for is sent for approval
    ...(data.purpose === "product"
      ? {}
      : {
          expiresAt: new Date(
            Date.now() +
              (data.purpose === "product-draft" ? DRAFT_PHOTO_DAYS : getEnv().EVIDENCE_RETENTION_DAYS) * 86400 * 1000,
          ),
        }),
  });
  if (provider === "local") {
    evidence.url = `/api/evidence/${evidence._id}`;
    await evidence.save();
  }
  if (data.purpose === "product" && data.productId) {
    // a new photo goes at the end; it only becomes the cover when the product had none
    await Product.updateOne({ _id: data.productId }, { $addToSet: { images: evidence.url } });
    await Product.updateOne(
      { _id: data.productId, $or: [{ image: { $exists: false } }, { image: null }, { image: "" }] },
      { $set: { image: evidence.url } },
    );
  }
  await AuditLog.create({
    actorId,
    action: `evidence.${data.purpose}.upload`,
    target: String(evidence._id),
    details: {
      orderId: data.orderId,
      complaintId: data.complaintId,
      productId: data.productId,
      mime: input.file.type,
      size: input.file.size,
    },
  });
  return evidence;
}
