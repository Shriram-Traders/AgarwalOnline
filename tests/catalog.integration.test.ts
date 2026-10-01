import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  Category,
  Product,
  ProductVariant,
  InventoryItem,
} from "../src/lib/db/models";
import { catalog } from "../src/lib/catalog/queries";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("MongoDB catalog", () => {
  beforeAll(async () => {
    if (!uri?.includes("/ags_test"))
      throw Error("Isolated test database required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    await mongoose.connection.dropDatabase();
    const c = await Category.create({
      slug: "staples",
      name: { en: "Staples", mr: "धान्य" },
    });
    for (const status of ["published", "draft"]) {
      const p = await Product.create({
        slug: `rice-${status}`,
        name: { en: "Basmati Rice", mr: "बासमती तांदूळ" },
        description: { en: "Rice", mr: "तांदूळ" },
        categoryId: c._id,
        categorySlug: "staples",
        status,
        aliases: ["chawal"],
      });
      const v = await ProductVariant.create({
        productId: p._id,
        sku: status,
        label: "1 kg",
        unit: "kg",
        packQuantity: 1,
        pricePaise: 10000,
        mrpPaise: 12000,
      });
      await InventoryItem.create({ variantId: v._id, onHand: 10, reserved: 3 });
    }
    const paper = await Category.create({
      slug: "paper",
      name: { en: "Notebooks & Paper", mr: "वह्या व कागद" },
    });
    for (const [slug, en, categorySlug, categoryId] of [
      ["gel-pen-set", "Gel Pen Set", "staples", c._id],
      ["hb-pencil", "HB Pencil", "staples", c._id],
      ["a5-notebook", "A5 Notebook", "paper", paper._id],
    ] as const) {
      const p = await Product.create({
        slug,
        name: { en, mr: en },
        description: { en, mr: en },
        categoryId,
        categorySlug,
        status: "published",
      });
      const v = await ProductVariant.create({
        productId: p._id,
        sku: slug,
        label: "1 piece",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 5000,
        mrpPaise: 6000,
      });
      await InventoryItem.create({ variantId: v._id, onHand: 5, reserved: 0 });
    }
  });
  const slugs = async (q: string) => (await catalog({ q })).map((item) => item.slug);
  it("matches every word, plurals and partial words", async () => {
    expect(await slugs("gel pens")).toEqual(["gel-pen-set"]);
    expect(await slugs("pens")).toContain("gel-pen-set");
    expect(await slugs("note")).toEqual(["a5-notebook"]);
  });
  it("ranks the closest match first", async () => {
    expect((await slugs("pen"))[0]).toBe("gel-pen-set");
  });
  it("forgives a typo when nothing matches exactly", async () => {
    expect(await slugs("notbook")).toEqual(["a5-notebook"]);
    expect(await slugs("pencel")).toEqual(["hb-pencil"]);
  });
  it("finds products by their aisle's name, in English or Marathi", async () => {
    expect(await slugs("notebooks paper")).toEqual(["a5-notebook"]);
    expect(await slugs("वह्या")).toEqual(["a5-notebook"]);
  });
  it("keeps working when Atlas Search is switched on but unavailable", async () => {
    process.env.ATLAS_SEARCH_ENABLED = "true";
    try {
      expect(await slugs("gel pens")).toEqual(["gel-pen-set"]);
    } finally {
      delete process.env.ATLAS_SEARCH_ENABLED;
    }
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("returns the same published product for all three language queries", async () => {
    for (const q of ["Rice", "Chawal", "तांदूळ"]) {
      const results = await catalog({ q });
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe("rice-published");
      expect(results[0].variants[0].available).toBe(7);
    }
  });
  it("does not turn punctuation into unrestricted regex matching", async () => {
    expect(await catalog({ q: "nonexistent.*" })).toHaveLength(0);
  });
});
