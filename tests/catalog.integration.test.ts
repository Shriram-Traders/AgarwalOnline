import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  Category,
  Product,
  ProductVariant,
  InventoryItem,
} from "../src/lib/db/models";
import { anyOnOffer, catalog, catalogCategories, catalogSections, shopCatalogue } from "../src/lib/catalog/queries";
import { browseCatalog, filtersFrom } from "../src/lib/catalog/browse";
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
  it("lists what can be bought before what is sold out, and still lists the rest", async () => {
    // browsing goes aisle by aisle, so the paper aisle's notebook leads
    expect((await catalog())[0].slug).toBe("a5-notebook");
    const pack = await ProductVariant.findOne({ sku: "a5-notebook" });
    await InventoryItem.updateOne({ variantId: pack!._id }, { $set: { onHand: 0 } });
    try {
      expect((await catalog()).at(-1)!.slug).toBe("a5-notebook");
      expect(await slugs("note")).toEqual(["a5-notebook"]);
    } finally {
      await InventoryItem.updateOne({ variantId: pack!._id }, { $set: { onHand: 5 } });
    }
  });
  it("shows a product on its extra shelves too, without moving it from its own", async () => {
    await Product.updateOne({ slug: "gel-pen-set" }, { $set: { alsoOn: ["paper"] } });
    const on = async (category: string) => (await catalog({ category })).map((item) => item.slug);
    try {
      expect(await on("paper")).toEqual(["a5-notebook", "gel-pen-set"]);
      expect(await on("staples")).toContain("gel-pen-set");
      // found by either shelf's name
      expect((await slugs("notebooks paper")).sort()).toEqual(["a5-notebook", "gel-pen-set"]);
      expect((await catalog({ slug: "gel-pen-set" }))[0].alsoOn).toEqual(["paper"]);
    } finally {
      await Product.updateOne({ slug: "gel-pen-set" }, { $unset: { alsoOn: 1 } });
    }
  });
  it("groups shelves under sections, and lets one shelf sit in two", async () => {
    const [staples, paper] = await Promise.all([Category.findOne({ slug: "staples" }), Category.findOne({ slug: "paper" })]);
    const [office, school] = await Category.create([
      { slug: "for-office", name: { en: "Office", mr: "कार्यालय" } },
      { slug: "for-school", name: { en: "School", mr: "शाळा" } },
    ]);
    try {
      // before any shelf is grouped, there are no sections: one list of shelves
      expect(await catalogSections()).toEqual([]);
      await Category.updateOne({ _id: paper!._id }, { $set: { parentIds: [school._id, office._id] } });
      // the old "Inside another category" box is ignored: on the live shop it put one shelf of products
      // inside another (Pencils inside School Essentials), and reading it hid School Essentials' own page
      await Category.updateOne({ _id: staples!._id }, { $set: { parentId: paper!._id } });
      expect((await catalogSections()).map((section) => [section.slug, section.shelves.map((shelf) => shelf.slug)])).toEqual([
        ["for-office", ["paper"]],
        ["for-school", ["paper"]],
        ["", ["staples"]],
      ]);
      // a section is not a shelf: menus, the footer and the sitemap list shelves only
      expect((await catalogCategories()).map((category) => category.slug)).toEqual(["paper", "staples"]);
    } finally {
      await Category.deleteMany({ _id: { $in: [office._id, school._id] } });
      await Category.updateMany({}, { $unset: { parentIds: 1, parentId: 1 } });
    }
  });
  it("opens a planned category on the subcategory it's about, not the first in aisle order", async () => {
    const gifts = await Category.create({ slug: "gifts-party", name: { en: "Gifts and party", mr: "Gifts and party" } });
    // Diaries comes before Party & Gifting in the shop's aisle order; the plan puts Party & Gifting first
    await Category.create([
      { slug: "diaries", name: { en: "Diaries", mr: "Diaries" }, parentIds: [gifts._id] },
      { slug: "party-gifting", name: { en: "Party & Gifting", mr: "Party & Gifting" }, parentIds: [gifts._id] },
    ]);
    try {
      const section = (await catalogSections()).find((item) => item.slug === "gifts-party")!;
      expect(section.shelves.map((shelf) => shelf.slug)).toEqual(["party-gifting", "diaries"]);
    } finally {
      await Category.deleteMany({ slug: { $in: ["gifts-party", "diaries", "party-gifting"] } });
    }
  });
  it("a shopper's phone, browsing the whole catalogue it loaded, gives the server's answer", async () => {
    const { items, aisles, synonyms } = await shopCatalogue();
    const cases: Record<string, string>[] = [{}, { category: "paper" }, { q: "pens" }, { q: "notbook" }, { q: "वह्या" }, { q: "notebooks paper" }, { sort: "price-desc" }, { sort: "new" }, { inStock: "true" }];
    for (const params of cases) {
      const server = (await catalog(params)).map((item) => item.slug);
      const phone = browseCatalog(items, filtersFrom(new URLSearchParams(params)), { aisles, synonyms }).map((item) => item.slug);
      expect(phone, JSON.stringify(params)).toEqual(server);
    }
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
  it("says something is on offer only while a published pack sells below its MRP", async () => {
    expect(await anyOnOffer()).toBe(true);
    // MRP pricing everywhere, as in the real shop: the Offers and Deals links have nothing to show
    await ProductVariant.updateMany({}, [{ $set: { mrpPaise: "$pricePaise" } }], { updatePipeline: true });
    expect(await anyOnOffer()).toBe(false);
  });
  it("takes odd values in the address in its stride instead of failing the page", async () => {
    const all = (await catalog()).length;
    // a rating that isn't one, a repeated key, an aisle name too long: the plain catalogue
    expect(await catalog({ rating: "abc" })).toHaveLength(all);
    expect(await catalog({ rating: "9" })).toHaveLength(all);
    expect(await catalog({ q: ["rice", "x"] as unknown as string })).toHaveLength(all);
    expect(await catalog({ category: "c".repeat(80) })).toHaveLength(all);
    // a search longer than 100 characters is cut, not refused
    await expect(catalog({ q: "x".repeat(150) })).resolves.toEqual([]);
    // a web address no product can have finds nothing, never "any product"
    expect(await catalog({ slug: "s".repeat(120) })).toEqual([]);
  });
});
