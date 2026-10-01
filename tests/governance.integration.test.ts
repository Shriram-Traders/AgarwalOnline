import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
} from "../src/lib/db/models";
import { ApprovalRequest, ApprovalHistory } from "../src/lib/governance/models";
import { Notification } from "../src/lib/engagement/models";
import {
  submitProduct,
  submitVariant,
  requestPrice,
  adjustStock,
  reviewApproval,
  publishScheduled,
  withdrawRequest,
} from "../src/lib/governance/service";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Catalog governance", () => {
  let admin: string, reviewer: string, categoryId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const m of [
      User,
      Category,
      Product,
      ProductVariant,
      InventoryItem,
      ApprovalRequest,
      ApprovalHistory,
    ])
      await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    admin = String(
      (
        await User.create({
          name: "Test user",
          phone: "9000000081",
          roles: ["customer", "admin"],
        })
      )._id,
    );
    reviewer = String(
      (
        await User.create({
          name: "Test user",
          phone: "9000000082",
          roles: ["customer", "super-admin"],
        })
      )._id,
    );
    categoryId = String(
      (
        await Category.create({
          slug: "grain",
          name: { en: "Grain", mr: "धान्य" },
        })
      )._id,
    );
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const input = () => ({
    slug: "test-rice",
    nameEn: "Test rice",
    nameMr: "चाचणी तांदूळ",
    descriptionEn: "Rice for testing",
    descriptionMr: "चाचणीसाठी तांदूळ",
    brand: "Test",
    categoryId,
    aliases: "rice, तांदूळ",
    sku: "TEST-RICE",
    label: "1 kg",
    unit: "kg",
    packQuantity: 1,
    pricePaise: 10000,
    mrpPaise: 12000,
    stock: 10,
  });
  async function publishProduct() {
    await submitProduct(admin, input());
    const r = await ApprovalRequest.findOne({ kind: "product" });
    await reviewApproval(reviewer, {
      requestId: String(r._id),
      decision: "approved",
      comment: "Checked product",
    });
    return ProductVariant.findOne({});
  }
  it("keeps products hidden until a different authorized reviewer approves", async () => {
    // with two owners, one owner's request waits for the other
    await User.create({ name: "Second owner", phone: "9000000083", roles: ["customer", "super-admin"] });
    await submitProduct(reviewer, input());
    const r = await ApprovalRequest.findOne({});
    expect(await Product.countDocuments()).toBe(0);
    await expect(
      reviewApproval(admin, {
        requestId: String(r._id),
        decision: "approved",
        comment: "",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      reviewApproval(reviewer, {
        requestId: String(r._id),
        decision: "approved",
        comment: "",
      }),
    ).rejects.toThrow("own request");
    await User.updateOne({ _id: admin }, { roles: ["customer", "super-admin"] });
    await reviewApproval(admin, {
      requestId: String(r._id),
      decision: "approved",
      comment: "Checked",
    });
    expect(await Product.countDocuments({ status: "published" })).toBe(1);
    expect(await ApprovalHistory.countDocuments({ requestId: r._id })).toBe(3);
  });
  it("requires rejection reasons and defers scheduled publication", async () => {
    await submitProduct(admin, input());
    const r = await ApprovalRequest.findOne({});
    await expect(
      reviewApproval(reviewer, {
        requestId: String(r._id),
        decision: "rejected",
        comment: "",
      }),
    ).rejects.toThrow("reason");
    await reviewApproval(reviewer, {
      requestId: String(r._id),
      decision: "approved",
      comment: "Checked",
      scheduledAt: "2099-01-01T00:00:00Z",
    });
    await publishScheduled();
    expect(await Product.countDocuments()).toBe(0);
    await ApprovalRequest.updateOne(
      { _id: r._id },
      { scheduledAt: new Date(0) },
    );
    await publishScheduled();
    await publishScheduled();
    expect(await Product.countDocuments()).toBe(1);
  });
  it("rejects stale price approvals without partially publishing", async () => {
    const v = await publishProduct();
    await requestPrice(admin, {
      variantId: String(v._id),
      pricePaise: 9000,
      mrpPaise: 12000,
    });
    const r = await ApprovalRequest.findOne({ kind: "price" });
    await ProductVariant.updateOne({ _id: v._id }, { pricePaise: 9500 });
    await expect(
      reviewApproval(reviewer, {
        requestId: String(r._id),
        decision: "approved",
        comment: "Checked",
      }),
    ).rejects.toThrow("Prices changed");
    expect((await ApprovalRequest.findById(r._id)).state).toBe("pending");
    expect((await ProductVariant.findById(v._id)).pricePaise).toBe(9500);
  });
  it("protects reserved stock and routes large adjustments through review", async () => {
    const v = await publishProduct();
    await InventoryItem.updateOne({ variantId: v._id }, { reserved: 5 });
    await expect(
      adjustStock(admin, {
        variantId: String(v._id),
        delta: -6,
        reason: "Stock correction",
      }),
    ).rejects.toThrow("reservations");
    await adjustStock(admin, {
      variantId: String(v._id),
      delta: 100,
      reason: "New shipment",
    });
    expect((await InventoryItem.findOne({ variantId: v._id })).onHand).toBe(10);
    const r = await ApprovalRequest.findOne({ kind: "stock" });
    await reviewApproval(reviewer, {
      requestId: String(r._id),
      decision: "approved",
      comment: "Shipment checked",
    });
    expect((await InventoryItem.findOne({ variantId: v._id })).onHand).toBe(
      110,
    );
  });
  it("lets an owner who runs the shop alone make changes at once, still on record", async () => {
    // reviewer is the only owner here
    const { live } = await submitProduct(reviewer, input());
    expect(live).toBe(true);
    expect(await Product.countDocuments({ status: "published" })).toBe(1);
    const request = await ApprovalRequest.findOne({ kind: "product" });
    expect(request.state).toBe("published");
    expect(String(request.reviewerId)).toBe(reviewer);
    const v = await ProductVariant.findOne({});
    expect((await requestPrice(reviewer, { variantId: String(v._id), pricePaise: 9000, mrpPaise: 12000 })).live).toBe(true);
    expect((await ProductVariant.findById(v._id)).pricePaise).toBe(9000);
  });
  it("applies an approved stock delivery even if some sold in the meantime", async () => {
    const v = await publishProduct();
    await adjustStock(admin, { variantId: String(v._id), delta: 100, reason: "New shipment" });
    // two sold while the request waited
    await InventoryItem.updateOne({ variantId: v._id }, { $inc: { onHand: -2 } });
    const r = await ApprovalRequest.findOne({ kind: "stock" });
    await reviewApproval(reviewer, { requestId: String(r._id), decision: "approved", comment: "Checked" });
    expect((await InventoryItem.findOne({ variantId: v._id })).onHand).toBe(108);
  });
  it("sends new pack sizes through approval, and says when a change is already waiting", async () => {
    const v = await publishProduct();
    const product = await Product.findOne({});
    const pack = {
      productId: String(product._id),
      sku: "TEST-RICE-5",
      label: "5 kg",
      unit: "kg",
      packQuantity: 5,
      pricePaise: 45000,
      mrpPaise: 50000,
      maxQuantity: 5,
      stock: 20,
    };
    expect((await submitVariant(admin, pack)).live).toBe(false);
    expect(await ProductVariant.countDocuments()).toBe(1);
    await expect(submitVariant(admin, { ...pack, label: "Again" })).rejects.toThrow("SKU (TEST-RICE-5) is already used");
    const r = await ApprovalRequest.findOne({ kind: "variant" });
    await reviewApproval(reviewer, { requestId: String(r._id), decision: "approved", comment: "Checked" });
    const created = await ProductVariant.findOne({ sku: "TEST-RICE-5" });
    expect(created.maxQuantity).toBe(5);
    expect((await InventoryItem.findOne({ variantId: created._id })).onHand).toBe(20);
    await requestPrice(admin, { variantId: String(v._id), pricePaise: 9000, mrpPaise: 12000 });
    await expect(requestPrice(admin, { variantId: String(v._id), pricePaise: 8000, mrpPaise: 12000 })).rejects.toThrow(
      "already waiting",
    );
  });
  it("lets the person who asked withdraw a waiting change, and tells them decisions", async () => {
    const v = await publishProduct();
    await requestPrice(admin, { variantId: String(v._id), pricePaise: 9000, mrpPaise: 12000 });
    const r = await ApprovalRequest.findOne({ kind: "price" });
    await withdrawRequest(admin, String(r._id));
    expect((await ApprovalRequest.findById(r._id)).state).toBe("withdrawn");
    await requestPrice(admin, { variantId: String(v._id), pricePaise: 9500, mrpPaise: 12000 });
    const again = await ApprovalRequest.findOne({ kind: "price", state: "pending" });
    await reviewApproval(reviewer, { requestId: String(again._id), decision: "rejected", comment: "Too cheap for now" });
    const note = await Notification.findOne({ userId: admin, title: /not approved/ });
    expect(note?.body).toContain("Too cheap for now");
  });
  it("keeps publishing scheduled changes when one of them can't be applied", async () => {
    const v = await publishProduct();
    await requestPrice(admin, { variantId: String(v._id), pricePaise: 9000, mrpPaise: 12000 });
    const price = await ApprovalRequest.findOne({ kind: "price" });
    await reviewApproval(reviewer, {
      requestId: String(price._id),
      decision: "approved",
      comment: "Later",
      scheduledAt: "2099-01-01T00:00:00Z",
    });
    await adjustStock(admin, { variantId: String(v._id), delta: 100, reason: "New shipment" });
    const stock = await ApprovalRequest.findOne({ kind: "stock" });
    await reviewApproval(reviewer, {
      requestId: String(stock._id),
      decision: "approved",
      comment: "Later",
      scheduledAt: "2099-01-01T00:00:00Z",
    });
    // the price moved on meanwhile, so the scheduled price change can no longer apply
    await ProductVariant.updateOne({ _id: v._id }, { pricePaise: 9900 });
    await ApprovalRequest.updateMany({}, { scheduledAt: new Date(0) });
    expect(await publishScheduled()).toBe(1);
    expect((await ApprovalRequest.findById(price._id)).state).toBe("failed");
    expect((await ApprovalRequest.findById(stock._id)).state).toBe("published");
    expect((await InventoryItem.findOne({ variantId: v._id })).onHand).toBe(110);
  });
});
