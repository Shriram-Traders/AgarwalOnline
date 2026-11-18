import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  AuditLog,
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
  it("keeps staff products hidden until an owner approves; an owner may decide their own", async () => {
    await submitProduct(admin, input());
    const r = await ApprovalRequest.findOne({});
    expect(await Product.countDocuments()).toBe(0);
    await expect(
      reviewApproval(admin, {
        requestId: String(r._id),
        decision: "approved",
        comment: "",
      }),
    ).rejects.toThrow("FORBIDDEN");
    // the member of staff who asked becomes an owner, and settles the request they made themselves
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
  it("lets an owner make changes at once, even with a second owner, still on record", async () => {
    await User.create({ name: "Second owner", phone: "9000000083", roles: ["customer", "super-admin"] });
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
  it("makes each new pack a SKU from the web address, since nobody types one", async () => {
    await submitProduct(reviewer, { ...input(), sku: undefined });
    const product = await Product.findOne({});
    const pack = { productId: String(product._id), unit: "kg", packQuantity: 5, pricePaise: 45000, mrpPaise: 50000, maxQuantity: 5, stock: 20 };
    await submitVariant(reviewer, { ...pack, label: "5 kg" });
    // a member of staff's pack gets its SKU when an owner approves it
    await submitVariant(admin, { ...pack, label: "10 kg" });
    const waiting = await ApprovalRequest.findOne({ kind: "variant", state: "pending" });
    await reviewApproval(reviewer, { requestId: String(waiting._id), decision: "approved", comment: "Checked" });
    const packs = await ProductVariant.find({}).sort({ sku: 1 });
    expect(packs.map((v) => [v.label, v.sku])).toEqual([
      ["1 kg", "test-rice-1"],
      ["5 kg", "test-rice-2"],
      ["10 kg", "test-rice-3"],
    ]);
  });
  it("lets an owner change a staff member's product before approving, purchase price too, and tells staff no prices", async () => {
    await submitProduct(admin, input());
    const request = await ApprovalRequest.findOne({ kind: "product" });
    const review = (fields: Record<string, unknown>, decision = "approved") =>
      reviewApproval(reviewer, { requestId: String(request._id), decision, comment: decision === "rejected" ? "Wrong photos" : "", edit: "1", ...input(), showToCustomers: true, showToSchools: false, ...fields });
    // checked like the staff member's own form: a price above the MRP is refused and nothing changes
    await expect(review({ pricePaise: 13000 })).rejects.toThrow("Price must not exceed MRP");
    expect((await ApprovalRequest.findById(request._id)).state).toBe("pending");
    await review({ nameEn: "Better rice", pricePaise: 9000, costPaise: 6000, showToSchools: true, hsnCode: "1006" });
    const product = await Product.findOne({});
    expect(product.name.en).toBe("Better rice");
    expect(product.showToSchools).toBe(true);
    expect(product.hsnCode).toBe("1006");
    const pack = await ProductVariant.findOne({}).select("+costPaise");
    expect([pack.pricePaise, pack.costPaise]).toEqual([9000, 6000]);
    const history = await ApprovalHistory.findOne({ requestId: request._id, next: "approved" });
    expect(history.comment).toBe("Changed before approving: Name, Selling price, Schools see it, HSN code, Purchase price");
    expect(await AuditLog.exists({ action: "approval.edit", target: String(request._id) })).toBeTruthy();
    const note = await Notification.findOne({ userId: admin, title: /is live/ });
    expect(note.body).toBe("An owner approved it. They changed some details first.");
  });
  it("keeps a rejected request as it was asked for, and lets an owner change a price or stock request", async () => {
    const v = await publishProduct();
    const other = { ...input(), slug: "other-rice", sku: "OTHER-RICE" };
    await submitProduct(admin, other);
    const asked = await ApprovalRequest.findOne({ kind: "product", state: "pending" });
    await reviewApproval(reviewer, { requestId: String(asked._id), decision: "rejected", comment: "Wrong photos", edit: "1", ...other, pricePaise: 5000 });
    expect((await ApprovalRequest.findById(asked._id)).after.pricePaise).toBe(10000);
    await requestPrice(admin, { variantId: String(v._id), pricePaise: 9000, mrpPaise: 12000 });
    const price = await ApprovalRequest.findOne({ kind: "price" });
    await reviewApproval(reviewer, { requestId: String(price._id), decision: "approved", comment: "", edit: "1", pricePaise: 9500, mrpPaise: 12000 });
    expect((await ProductVariant.findById(v._id)).pricePaise).toBe(9500);
    // 100 is a large delivery, so it waits; the owner counts 50
    await adjustStock(admin, { variantId: String(v._id), delta: 100, reason: "New shipment" });
    const stock = await ApprovalRequest.findOne({ kind: "stock" });
    await reviewApproval(reviewer, { requestId: String(stock._id), decision: "approved", comment: "", edit: "1", delta: "50" });
    expect((await InventoryItem.findOne({ variantId: v._id })).onHand).toBe(60);
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
