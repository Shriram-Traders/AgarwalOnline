import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { InventoryMovement, SystemSetting } from "../src/lib/commerce/models";
import { setCartLine } from "../src/lib/commerce/service";
import { ApprovalHistory, ApprovalRequest } from "../src/lib/governance/models";
import { Notification } from "../src/lib/engagement/models";
import {
  adjustStock,
  publishScheduled,
  requestDelete,
  requestPrice,
  reviewApproval,
  submitProduct,
  submitVariant,
} from "../src/lib/governance/service";
import { setAlertLevel, setProductVisibility, updateVariant } from "../src/lib/catalog/manage";
import { applyStockImport, planStockImport, stockSheet } from "../src/lib/inventory/import";
import { LOW_STOCK, lowStockRows } from "../src/lib/inventory/low-stock";
import { shopperVisible } from "../src/lib/catalog/visibility";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Removing stock and deleting packs and products", () => {
  let staff: string, owner: string, customer: string, categoryId: string, productId: string, packId: string, otherPackId: string;
  const stockOf = (id: string) => InventoryItem.findOne({ variantId: id });
  const makePack = async (sku: string, label: string, onHand: number) => {
    const pack = await ProductVariant.create({ productId, sku, label, unit: "piece", packQuantity: 1, pricePaise: 3000, mrpPaise: 3500 });
    await InventoryItem.create({ variantId: pack._id, onHand });
    return String(pack._id);
  };
  const deletePack = (actor: string, reason?: string) => requestDelete(actor, { target: "pack", targetId: packId, reason });
  const pendingDelete = () => ApprovalRequest.findOne({ kind: "delete-pack", targetId: packId, state: "pending" });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, InventoryMovement, ApprovalRequest, ApprovalHistory, AuditLog, SystemSetting])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    staff = String((await User.create({ name: "Staff", phone: "9000000501", roles: ["customer", "admin"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000502", roles: ["customer", "super-admin"] }))._id);
    customer = String((await User.create({ name: "Shopper", phone: "9000000503", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    categoryId = String(category._id);
    const product = await Product.create({
      slug: "notebook",
      name: { en: "Notebook", mr: "वही" },
      description: { en: "Notebook", mr: "वही" },
      categoryId: category._id,
      categorySlug: "paper",
      status: "published",
    });
    productId = String(product._id);
    packId = await makePack("NB-100", "100 pages", 30);
    otherPackId = await makePack("NB-200", "200 pages", 20);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe("deleting a pack", () => {
    it("happens at once for an owner: its stock is written off and the record stays for past orders", async () => {
      expect(await deletePack(owner)).toEqual({ live: true });
      const pack = await ProductVariant.findById(packId);
      expect(pack.active).toBe(false);
      expect(pack.deletedAt).toBeInstanceOf(Date);
      // past orders and bills still find it by id, under its own name
      expect(pack.label).toBe("100 pages");
      // it gives up its SKU, so a new pack can have it
      expect(pack.sku).toMatch(/^NB-100-deleted-/);
      expect((await stockOf(packId)).onHand).toBe(0);
      const movement = await InventoryMovement.findOne({ variantId: packId, quantity: -30, kind: "adjust" });
      expect(movement).toBeTruthy();
      expect(await AuditLog.exists({ action: "approval.publish.delete-pack", target: packId })).toBeTruthy();
      // the other pack is untouched
      expect((await ProductVariant.findById(otherPackId)).active).not.toBe(false);
    });

    it("waits for an owner when staff ask, and tells them what was decided", async () => {
      await expect(deletePack(staff)).rejects.toThrow("Say why");
      expect(await deletePack(staff, "Test pack added by mistake")).toEqual({ live: false });
      expect((await ProductVariant.findById(packId)).deletedAt).toBeUndefined();
      expect((await stockOf(packId)).onHand).toBe(30);
      await expect(deletePack(staff, "Test pack added by mistake")).rejects.toThrow("already waiting");

      // rejected: nothing happens, and the person who asked hears why
      await reviewApproval(owner, { requestId: String((await pendingDelete())._id), decision: "rejected", comment: "Still selling these" });
      expect((await ProductVariant.findById(packId)).deletedAt).toBeUndefined();
      expect(await Notification.exists({ userId: staff, title: /was not approved/ })).toBeTruthy();

      // asked again and approved: it goes
      await deletePack(staff, "Test pack added by mistake");
      await reviewApproval(owner, { requestId: String((await pendingDelete())._id), decision: "approved", comment: "" });
      expect((await ProductVariant.findById(packId)).deletedAt).toBeInstanceOf(Date);
      expect(await Notification.exists({ userId: staff, title: "Your request to delete a pack was approved" })).toBeTruthy();
    });

    it("is refused while open orders hold stock, when asked and again at approval", async () => {
      await InventoryItem.updateOne({ variantId: packId }, { reserved: 2 });
      await expect(deletePack(owner)).rejects.toThrow("2 are held for open orders");
      await expect(deletePack(staff, "Test pack added by mistake")).rejects.toThrow("2 are held");

      await InventoryItem.updateOne({ variantId: packId }, { reserved: 0 });
      await deletePack(staff, "Test pack added by mistake");
      await InventoryItem.updateOne({ variantId: packId }, { reserved: 1 });
      const request = await pendingDelete();
      await expect(reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "" })).rejects.toThrow("1 is held");
      // nothing half-done: the request is still there to decide later
      expect((await ApprovalRequest.findById(request._id)).state).toBe("pending");
      expect((await ProductVariant.findById(packId)).deletedAt).toBeUndefined();
    });

    it("leaves the shop and baskets, and frees its SKU", async () => {
      await setCartLine(customer, packId, 1);
      await deletePack(owner);
      await expect(setCartLine(customer, packId, 1)).rejects.toThrow("unavailable");
      // the same SKU can be used for a new pack
      const { live } = await submitVariant(owner, {
        productId,
        sku: "NB-100",
        label: "100 pages new",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 3000,
        mrpPaise: 3500,
        maxQuantity: 10,
        stock: 5,
      });
      expect(live).toBe(true);
      expect(await ProductVariant.countDocuments({ sku: "NB-100" })).toBe(1);
    });

    it("takes back what was waiting for it, and a scheduled change fails with a reason", async () => {
      await requestPrice(staff, { variantId: packId, pricePaise: 2500, mrpPaise: 3500 });
      const waiting = await ApprovalRequest.findOne({ kind: "price", targetId: packId, state: "pending" });
      await adjustStock(staff, { variantId: otherPackId, delta: -1, reason: "Damaged in the shop" });

      await requestPrice(staff, { variantId: otherPackId, pricePaise: 2000, mrpPaise: 3500 });
      const scheduled = await ApprovalRequest.findOne({ kind: "price", targetId: otherPackId, state: "pending" });
      await reviewApproval(owner, { requestId: String(scheduled._id), decision: "approved", comment: "", scheduledAt: "2099-01-01T00:00:00Z" });

      await deletePack(owner);
      expect((await ApprovalRequest.findById(waiting._id)).state).toBe("withdrawn");
      expect(await ApprovalHistory.exists({ requestId: waiting._id, next: "withdrawn", comment: "The pack was deleted." })).toBeTruthy();

      await requestDelete(owner, { target: "pack", targetId: otherPackId });
      await ApprovalRequest.updateOne({ _id: scheduled._id }, { scheduledAt: new Date(0) });
      await publishScheduled();
      const failed = await ApprovalRequest.findById(scheduled._id);
      expect(failed.state).toBe("failed");
      expect(failed.failureReason).toMatch(/deleted/);
    });

    it("can't be changed afterwards, or deleted twice", async () => {
      await deletePack(owner);
      await expect(deletePack(owner)).rejects.toThrow("already deleted");
      await expect(requestPrice(owner, { variantId: packId, pricePaise: 2500, mrpPaise: 3500 })).rejects.toThrow("unavailable");
      await expect(adjustStock(owner, { variantId: packId, delta: 5, reason: "New delivery" })).rejects.toThrow("unavailable");
      await expect(updateVariant(owner, { variantId: packId, label: "Back", maxQuantity: 5, active: true })).rejects.toThrow("Pack not found");
      await expect(setAlertLevel(owner, { variantId: packId, alertBelow: 5 })).rejects.toThrow("Pack not found");
    });

    it("stops counting as sold out, and drops off the stock sheet", async () => {
      await InventoryItem.updateOne({ variantId: otherPackId }, { onHand: 25 });
      await deletePack(owner);
      expect(await InventoryItem.countDocuments(LOW_STOCK)).toBe(0);
      expect((await lowStockRows()).map((row) => row.pack)).not.toContain("100 pages");
      const sheet = await stockSheet(owner);
      expect(sheet).toContain("NB-200");
      expect(sheet).not.toContain("NB-100");
      const { rows } = await planStockImport(owner, "sku,count,change,reason\nNB-100,5,,Counted");
      expect(rows[0]).toMatchObject({ outcome: "error", message: "No pack has this SKU." });
    });
  });

  describe("deleting a product", () => {
    const deleteProduct = (actor: string, reason?: string) => requestDelete(actor, { target: "product", targetId: productId, reason });

    it("takes its packs with it, frees its web address and can't be shown again", async () => {
      expect(await deleteProduct(owner)).toEqual({ live: true });
      const product = await Product.findById(productId);
      expect(product.deletedAt).toBeInstanceOf(Date);
      expect(product.status).toBe("draft");
      expect(product.name.en).toBe("Notebook");
      expect(await Product.exists({ _id: productId, ...shopperVisible })).toBeNull();
      expect(await ProductVariant.countDocuments({ productId, deletedAt: null })).toBe(0);
      expect((await stockOf(packId)).onHand).toBe(0);
      expect((await stockOf(otherPackId)).onHand).toBe(0);
      await expect(setCartLine(customer, packId, 1)).rejects.toThrow("unavailable");
      await expect(setProductVisibility(owner, { productId, visible: "show" })).rejects.toThrow("Product not found");

      const { live } = await submitProduct(owner, {
        slug: "notebook",
        nameEn: "Notebook again",
        nameMr: "वही पुन्हा",
        descriptionEn: "A new notebook",
        descriptionMr: "नवीन वही",
        brand: "Test",
        categoryId,
        aliases: "",
        sku: "NB-100",
        label: "100 pages",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 3000,
        mrpPaise: 3500,
        stock: 5,
      });
      expect(live).toBe(true);
    });

    it("waits for an owner when staff ask, and is refused if any pack is held", async () => {
      await InventoryItem.updateOne({ variantId: otherPackId }, { reserved: 1 });
      await expect(deleteProduct(owner)).rejects.toThrow("1 is held");
      await InventoryItem.updateOne({ variantId: otherPackId }, { reserved: 0 });

      expect(await deleteProduct(staff, "We no longer stock these")).toEqual({ live: false });
      expect((await Product.findById(productId)).deletedAt).toBeUndefined();
      const request = await ApprovalRequest.findOne({ kind: "delete-product", state: "pending" });
      expect(request.before).toMatchObject({ nameEn: "Notebook", packs: 2, onHand: 50 });
      await reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "" });
      expect((await Product.findById(productId)).deletedAt).toBeInstanceOf(Date);
    });

    it("takes back waiting requests for its packs and new pack sizes for it", async () => {
      await requestPrice(staff, { variantId: packId, pricePaise: 2500, mrpPaise: 3500 });
      await deletePack(staff, "Test pack added by mistake");
      await submitVariant(staff, {
        productId,
        sku: "NB-300",
        label: "300 pages",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 3000,
        mrpPaise: 3500,
        maxQuantity: 10,
        stock: 5,
      });
      await deleteProduct(owner);
      expect(await ApprovalRequest.countDocuments({ state: "pending" })).toBe(0);
      expect(await ApprovalRequest.countDocuments({ state: "withdrawn" })).toBe(3);
    });
  });

  describe("removing stock", () => {
    it("always waits for an owner when staff remove, even one", async () => {
      const { outcome } = await adjustStock(staff, { variantId: packId, delta: -1, reason: "Damaged" });
      expect(outcome).toBe("pending");
      expect((await stockOf(packId)).onHand).toBe(30);
      const request = await ApprovalRequest.findOne({ kind: "stock", targetId: packId, state: "pending" });
      await reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "" });
      expect((await stockOf(packId)).onHand).toBe(29);
    });

    it("applies at once for an owner, and for staff adding a small amount", async () => {
      expect((await adjustStock(owner, { variantId: packId, delta: -5, reason: "Expired" })).outcome).toBe("applied");
      expect((await stockOf(packId)).onHand).toBe(25);
      expect((await adjustStock(staff, { variantId: packId, delta: 5, reason: "New delivery" })).outcome).toBe("applied");
      expect((await stockOf(packId)).onHand).toBe(30);
    });

    it("says straight away when it would take stock orders hold", async () => {
      await InventoryItem.updateOne({ variantId: packId }, { reserved: 28 });
      await expect(adjustStock(staff, { variantId: packId, delta: -3, reason: "Damaged" })).rejects.toThrow("reservations");
      expect(await ApprovalRequest.countDocuments({ kind: "stock" })).toBe(0);
    });

    it("treats a lower count on the sheet the same way for staff", async () => {
      const text = "sku,count,change,reason\nNB-100,25,,Monthly count\nNB-200,,3,Delivery";
      expect((await planStockImport(staff, text)).rows.map((row) => row.outcome)).toEqual(["approval", "apply"]);
      expect((await planStockImport(owner, text)).rows.map((row) => row.outcome)).toEqual(["apply", "apply"]);
      expect(await applyStockImport(staff, text)).toMatchObject({ applied: 1, waiting: 1 });
      expect((await stockOf(packId)).onHand).toBe(30);
      expect((await stockOf(otherPackId)).onHand).toBe(23);
    });
  });
});
