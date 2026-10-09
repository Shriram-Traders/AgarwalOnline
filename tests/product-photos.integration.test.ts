import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// the photo route is asked as a signed-out shopper would
vi.mock("../src/lib/auth/session", () => ({ currentUser: async () => null }));
import { unlink } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { UploadedEvidence } from "../src/lib/evidence/models";
import { storeEvidence } from "../src/lib/evidence/service";
import { saveProductPhotos, updateProductMetadata } from "../src/lib/catalog/manage";
import { ApprovalHistory, ApprovalRequest } from "../src/lib/governance/models";
import { reviewApproval, submitProduct } from "../src/lib/governance/service";
import { runRetention } from "../src/lib/retention";
import { GET } from "../src/app/api/evidence/[id]/route";
import { orderProductPhotos } from "../scripts/migrate-photo-order";

const uri = process.env.TEST_MONGODB_URI;
// a 1×1 PNG: enough for the upload path, which checks type and size, not pixels
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name: string) => new File([png], name, { type: "image/png" });

describe.skipIf(!uri)("Product photos: order, cover, Add product and the limit", () => {
  let admin: string, owner: string, rider: string, productId: string, categoryId: string;
  const written: string[] = [];
  const upload = async (actor: string, purpose: "product" | "product-draft", target?: string) => {
    const photo = await storeEvidence(actor, { file: file("photo.png"), purpose, productId: target });
    written.push(photo.storageKey);
    return photo.url as string;
  };

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) delete process.env[key];
    await connectDB();
    for (const m of [User, Category, Product, ProductVariant, InventoryItem, UploadedEvidence, ApprovalRequest, ApprovalHistory, AuditLog])
      await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    admin = String((await User.create({ name: "Staff", phone: "9000000301", roles: ["customer", "admin"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000302", roles: ["customer", "super-admin"] }))._id);
    rider = String((await User.create({ name: "Rider", phone: "9000000303", roles: ["customer", "delivery"] }))._id);
    categoryId = String((await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } }))._id);
    productId = String(
      (
        await Product.create({
          slug: "notebook",
          name: { en: "Notebook", mr: "वही" },
          description: { en: "A notebook", mr: "वही" },
          categoryId,
          categorySlug: "paper",
          status: "published",
        })
      )._id,
    );
  });
  afterAll(async () => {
    for (const key of written) await unlink(path.join(process.cwd(), ".local", "uploads", key)).catch(() => undefined);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe("Edit product", () => {
    it("adds each upload at the end and keeps the first as the cover", async () => {
      const first = await upload(admin, "product", productId);
      const second = await upload(admin, "product", productId);
      const third = await upload(admin, "product", productId);
      const product = await Product.findById(productId);
      expect(product.images).toEqual([first, second, third]);
      // the first upload became the cover; later ones didn't take it over
      expect(product.image).toBe(first);
    });

    it("saves a new order, with the first as the cover, and records it", async () => {
      const a = await upload(admin, "product", productId);
      const b = await upload(admin, "product", productId);
      const link = "https://images.unsplash.com/photo-1?w=700";
      await saveProductPhotos(admin, { productId, images: [b, link, a] });
      const product = await Product.findById(productId);
      expect(product.images).toEqual([b, link, a]);
      expect(product.image).toBe(b);
      const audit = await AuditLog.findOne({ action: "product.photos.update" }).lean<{ details: { before: string[]; after: string[] } }>();
      expect(audit?.details).toEqual({ before: [a, b], after: [b, link, a] });
      // removing every photo clears the cover too
      await saveProductPhotos(admin, { productId, images: [] });
      const empty = await Product.findById(productId);
      expect(empty.images).toEqual([]);
      expect(empty.image).toBeUndefined();
    });

    it("stops at ten photos", async () => {
      const ten = Array.from({ length: 10 }, (_, n) => `https://example.com/photo-${n}.jpg`);
      await saveProductPhotos(admin, { productId, images: ten });
      await expect(upload(admin, "product", productId)).rejects.toThrow("Product already has 10 photos");
      await expect(saveProductPhotos(admin, { productId, images: [...ten, "https://example.com/11.jpg"] })).rejects.toThrow();
      expect(await UploadedEvidence.countDocuments({})).toBe(0);
    });

    it("refuses unsafe addresses", async () => {
      for (const bad of ["javascript:alert(1)", "http://example.com/a.jpg", "/elsewhere/a.jpg"])
        await expect(saveProductPhotos(admin, { productId, images: [bad] })).rejects.toThrow();
    });

    it("leaves the photos alone when the product's details are saved", async () => {
      const a = await upload(admin, "product", productId);
      const b = await upload(admin, "product", productId);
      await saveProductPhotos(admin, { productId, images: [b, a] });
      await updateProductMetadata(admin, {
        productId,
        nameEn: "Notebook A5",
        nameMr: "वही A5",
        descriptionEn: "A ruled notebook",
        descriptionMr: "रेघी वही",
        brand: "",
        categoryId,
        aliases: "",
        featured: false,
        bestseller: false,
        // an old form still sending the links box changes nothing
        images: "https://example.com/stale.jpg",
      });
      const product = await Product.findById(productId);
      expect(product.name.en).toBe("Notebook A5");
      expect(product.images).toEqual([b, a]);
      expect(product.image).toBe(b);
    });

    it("is only for staff who manage the catalogue", async () => {
      await expect(upload(rider, "product", productId)).rejects.toThrow("FORBIDDEN");
      await expect(upload(rider, "product-draft")).rejects.toThrow("FORBIDDEN");
      await expect(saveProductPhotos(rider, { productId, images: [] })).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("Add product", () => {
    const input = (images: string[]) => ({
      slug: "pen-set",
      nameEn: "Pen set",
      nameMr: "पेन संच",
      descriptionEn: "A set of pens",
      descriptionMr: "पेनांचा संच",
      brand: "",
      categoryId,
      aliases: "",
      sku: "PEN-SET",
      label: "Pack of 5",
      unit: "piece",
      packQuantity: 5,
      pricePaise: 9900,
      mrpPaise: 9900,
      stock: 10,
      images,
    });

    it("goes live with the chosen photos in order, and they become the product's own", async () => {
      const drafts = [await upload(admin, "product-draft"), await upload(admin, "product-draft"), await upload(admin, "product-draft")];
      const draft = await UploadedEvidence.findOne({ url: drafts[0] });
      expect(draft.purpose).toBe("product-draft");
      expect(draft.expiresAt.getTime()).toBeLessThan(Date.now() + 8 * 86400 * 1000);
      // a draft photo is for staff only until the product is live
      const before = await GET(new Request(`http://127.0.0.1:3000${drafts[0]}`), { params: Promise.resolve({ id: String(draft._id) }) });
      expect(before.status).toBe(404);

      const order = [drafts[2], drafts[0], drafts[1]];
      await submitProduct(admin, input(order));
      // waiting for approval, the photos are kept as long as the request might wait
      expect((await UploadedEvidence.findOne({ url: drafts[0] })).expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400 * 1000);
      const request = await ApprovalRequest.findOne({ kind: "product" });
      expect(request.after.images).toEqual(order);
      await reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "Looks right" });

      const product = await Product.findOne({ slug: "pen-set" });
      expect(product.images).toEqual(order);
      expect(product.image).toBe(drafts[2]);
      const photos = await UploadedEvidence.find({ url: { $in: drafts } });
      for (const photo of photos) {
        expect(photo.purpose).toBe("product");
        expect(String(photo.productId)).toBe(String(product._id));
        expect(photo.expiresAt).toBeUndefined();
      }
      const after = await GET(new Request(`http://127.0.0.1:3000${drafts[0]}`), { params: Promise.resolve({ id: String(draft._id) }) });
      expect(after.status).toBe(200);
    });

    it("works without photos, as before", async () => {
      await submitProduct(admin, input([]));
      const request = await ApprovalRequest.findOne({ kind: "product" });
      await reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "Fine" });
      const product = await Product.findOne({ slug: "pen-set" });
      expect(product.images).toEqual([]);
      expect(product.image).toBeUndefined();
    });

    it("cleans up photos chosen for a product that was never sent", async () => {
      const unused = await upload(admin, "product-draft");
      await UploadedEvidence.updateOne({ url: unused }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const kept = await upload(admin, "product", productId);
      await runRetention();
      expect(await UploadedEvidence.exists({ url: unused })).toBeFalsy();
      expect(await UploadedEvidence.exists({ url: kept })).toBeTruthy();
    });
  });

  it("puts each old-style cover first, once", async () => {
    await Product.updateOne({ _id: productId }, { $set: { image: "https://example.com/c.jpg", images: ["https://example.com/a.jpg", "https://example.com/c.jpg"] } });
    const tidy = await Product.create({
      slug: "tidy",
      name: { en: "Tidy", mr: "नीट" },
      description: { en: "Tidy", mr: "नीट" },
      categoryId,
      categorySlug: "paper",
      status: "published",
      image: "https://example.com/x.jpg",
      images: ["https://example.com/x.jpg"],
    });
    expect(await orderProductPhotos()).toBe(1);
    expect((await Product.findById(productId)).images).toEqual(["https://example.com/c.jpg", "https://example.com/a.jpg"]);
    expect((await Product.findById(tidy._id)).images).toEqual(["https://example.com/x.jpg"]);
    expect(await orderProductPhotos()).toBe(0);
  });
});
