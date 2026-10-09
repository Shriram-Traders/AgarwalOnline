import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { InventoryMovement, SystemSetting } from "../src/lib/commerce/models";
import { ApprovalRequest } from "../src/lib/governance/models";
import { applyStockImport, planStockImport, stockSheet } from "../src/lib/inventory/import";
import { parseCsv } from "../src/lib/inventory/csv";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Stock from a spreadsheet", () => {
  let admin: string, owner: string, rider: string;
  const onHand = async (sku: string) => {
    const variant = await ProductVariant.findOne({ sku });
    return (await InventoryItem.findOne({ variantId: variant._id })).onHand as number;
  };
  const sheet = (...rows: string[]) => ["sku,count,change,reason", ...rows].join("\n");

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, InventoryMovement, ApprovalRequest, AuditLog, SystemSetting])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    admin = String((await User.create({ name: "Staff", phone: "9000000401", roles: ["customer", "admin"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000402", roles: ["customer", "super-admin"] }))._id);
    rider = String((await User.create({ name: "Rider", phone: "9000000403", roles: ["customer", "delivery"] }))._id);
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const product = await Product.create({
      slug: "notebook",
      name: { en: "Notebook", mr: "वही" },
      description: { en: "Notebook", mr: "वही" },
      categoryId: category._id,
      categorySlug: "paper",
      status: "published",
    });
    for (const [sku, label, stock] of [
      ["NB-100", "100 pages", 20],
      ["NB-200", "200 pages", 5],
      ["NB-400", "400 pages", 0],
    ] as const) {
      const variant = await ProductVariant.create({
        productId: product._id,
        sku,
        label,
        unit: "piece",
        packQuantity: 1,
        pricePaise: 3000,
        mrpPaise: 3500,
      });
      await InventoryItem.create({ variantId: variant._id, onHand: stock });
    }
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("downloads every pack with what's on the shelf and empty columns to fill", async () => {
    const rows = parseCsv(await stockSheet(admin));
    expect(rows[0]).toEqual(["sku", "product", "pack", "on_shelf", "count", "change", "reason"]);
    expect(rows.slice(1)).toEqual([
      ["NB-100", "Notebook", "100 pages", "20", "", "", ""],
      ["NB-200", "Notebook", "200 pages", "5", "", "", ""],
      ["NB-400", "Notebook", "400 pages", "0", "", "", ""],
    ]);
  });

  it("says what each row will do without changing anything", async () => {
    const { rows, problem } = await planStockImport(
      admin,
      sheet(
        "NB-100,12,,Monthly count", // counted 12 of 20: take off 8
        "nb-200,,+3,", // a change, and SKUs in any case; the shared reason covers it
        "NB-400,,,", // nothing filled in
        "NB-999,4,,Counted", // no such pack
        "NB-100,,1,Counted again", // already on an earlier row
      ),
      "Shelf check",
    );
    expect(problem).toBeUndefined();
    expect(rows.map((row) => [row.line, row.outcome, row.delta, row.after])).toEqual([
      [2, "apply", -8, 12],
      [3, "apply", 3, 8],
      [4, "same", undefined, undefined],
      [5, "error", undefined, undefined],
      [6, "error", undefined, undefined],
    ]);
    expect(rows[1].reason).toBe("Shelf check");
    expect(rows[3].message).toBe("No pack has this SKU.");
    expect(await onHand("NB-100")).toBe(20);
    expect(await InventoryMovement.countDocuments()).toBe(0);
  });

  it("refuses rows that can't be right", async () => {
    const { rows } = await planStockImport(
      admin,
      sheet("NB-100,5,2,Both filled", "NB-200,,-9,Too many", "NB-400,2.5,,Half"),
    );
    expect(rows.map((row) => row.message)).toEqual([
      "Fill Count or Change, not both.",
      "Only 5 on the shelf; it can’t go below 0.",
      "Count must be a whole number, 0 or more.",
    ]);
    const words = await planStockImport(admin, sheet("NB-100,,x,What", ",4,,No code"));
    expect(words.rows.map((row) => row.message)).toEqual(["Change must be a whole number, like 12 or -3.", "No SKU."]);
    const noReason = await planStockImport(admin, sheet("NB-100,,4,"));
    expect(noReason.rows[0]).toMatchObject({ outcome: "error", message: expect.stringContaining("Add a reason") });
  });

  it("explains a sheet it can't read at all", async () => {
    expect((await planStockImport(admin, "product,price\nNotebook,30")).problem).toMatch(/“sku” column/);
    expect((await planStockImport(admin, "sku,product\nNB-100,Notebook")).problem).toMatch(/“count” or a “change”/);
    expect((await planStockImport(admin, "sku,count")).problem).toMatch(/no rows/);
    const huge = ["sku,change", ...Array.from({ length: 501 }, (_, i) => `X-${i},1`)].join("\n");
    expect((await planStockImport(admin, huge)).problem).toMatch(/up to 500 packs/);
  });

  it("applies the sheet through the normal stock change, so big changes wait for an owner", async () => {
    await SystemSetting.create({ key: "large-stock-threshold", value: 50 });
    const text = sheet("NB-100,12,,Monthly count", "NB-200,,60,Supplier delivery", "NB-400,,-1,Damaged", "NB-999,1,,Counted");
    expect((await planStockImport(admin, text)).rows.map((row) => row.outcome)).toEqual(["apply", "approval", "error", "error"]);
    const result = await applyStockImport(admin, text);
    expect(result).toEqual({
      applied: 1,
      waiting: 1,
      failed: [
        { line: 4, sku: "NB-400", message: "Only 0 on the shelf; it can’t go below 0." },
        { line: 5, sku: "NB-999", message: "No pack has this SKU." },
      ],
    });
    expect(await onHand("NB-100")).toBe(12);
    // the 60 waits for the owner, as it would from the Stock page
    expect(await onHand("NB-200")).toBe(5);
    expect(await ApprovalRequest.countDocuments({ kind: "stock", state: "pending" })).toBe(1);
    expect(await AuditLog.countDocuments({ actorId: admin })).toBeGreaterThan(0);
    // reading the same counts again changes nothing more
    expect((await planStockImport(admin, text)).rows[0]).toMatchObject({ outcome: "same", after: 12 });
  });

  it("lets the only owner's big changes through at once", async () => {
    await applyStockImport(owner, sheet("NB-200,,150,Supplier delivery"));
    expect(await onHand("NB-200")).toBe(155);
  });

  it("is for staff who can change stock only", async () => {
    await expect(stockSheet(rider)).rejects.toThrow("FORBIDDEN");
    await expect(planStockImport(rider, sheet("NB-100,1,,Counted"))).rejects.toThrow("FORBIDDEN");
    await expect(applyStockImport(rider, sheet("NB-100,1,,Counted"))).rejects.toThrow("FORBIDDEN");
    expect(await onHand("NB-100")).toBe(20);
  });
});
