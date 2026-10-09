import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { WishlistItem } from "../src/lib/engagement/models";
import { ShoppingList } from "../src/lib/lists/models";
import { catalog, catalogForSchools, schoolProductBySlug } from "../src/lib/catalog/queries";
import { basketFor, setCartLine } from "../src/lib/commerce/service";
import { createList, describeItems, saveListItem } from "../src/lib/lists/service";
import { ensureSaved, toggleWishlist } from "../src/lib/engagement/service";
import { setProductAudience, setSchoolPrice, updateProductMetadata } from "../src/lib/catalog/manage";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Products for customers, schools or both", () => {
  let owner: string, admin: string, customer: string;
  const ids: Record<string, { product: string; variant: string }> = {};
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, CartLine, WishlistItem, ShoppingList, AuditLog])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    owner = String((await User.create({ name: "Owner", phone: "9000000071", roles: ["customer", "super-admin"] }))._id);
    admin = String((await User.create({ name: "Staff", phone: "9000000072", roles: ["customer", "admin"] }))._id);
    customer = String((await User.create({ name: "Shopper", phone: "9000000073", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const make = async (slug: string, audience: Record<string, boolean>, schoolPricePaise?: number) => {
      const product = await Product.create({
        slug,
        name: { en: slug, mr: slug },
        description: { en: slug, mr: slug },
        categoryId: category._id,
        categorySlug: "paper",
        status: "published",
        ...audience,
      });
      const variant = await ProductVariant.create({
        productId: product._id,
        sku: slug.toUpperCase(),
        label: "Pack",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 5900,
        mrpPaise: 6500,
        ...(schoolPricePaise ? { schoolPricePaise } : {}),
      });
      await InventoryItem.create({ variantId: variant._id, onHand: 50 });
      ids[slug] = { product: String(product._id), variant: String(variant._id) };
    };
    await make("shop-pen", {}); // made before schools existed: no flags at all
    await make("school-register", { showToCustomers: false, showToSchools: true }, 4200);
    await make("both-notebook", { showToSchools: true }, 2500);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("keeps school-only items out of the shop, and school prices out of shop pages", async () => {
    const shop = await catalog();
    expect(shop.map((item) => item.slug).sort()).toEqual(["both-notebook", "shop-pen"]);
    expect(shop.flatMap((item) => item.variants).some((v) => "schoolPricePaise" in v)).toBe(false);
    expect(await catalog({ slug: "school-register" })).toHaveLength(0);
    expect(await catalog({ q: "register" })).toHaveLength(0);
    // the page address can't ask for the school audience
    expect(await catalog({ audience: "schools", slug: "school-register" } as Record<string, string>)).toHaveLength(0);
  });

  it("shows schools what was ticked for them, with their prices", async () => {
    const schools = await catalogForSchools();
    expect(schools.map((item) => item.slug).sort()).toEqual(["both-notebook", "school-register"]);
    const register = schools.find((item) => item.slug === "school-register")!;
    expect(register.variants[0].schoolPricePaise).toBe(4200);
  });

  it("opens a product page in the school marketplace only for items ticked for schools", async () => {
    expect((await schoolProductBySlug("school-register"))?.variants[0].schoolPricePaise).toBe(4200);
    expect((await schoolProductBySlug("both-notebook"))?.variants[0].schoolPricePaise).toBe(2500);
    expect(await schoolProductBySlug("shop-pen")).toBeNull();
    expect(await schoolProductBySlug("no-such-thing")).toBeNull();
  });

  it("refuses school-only items in baskets, lists and wishlists", async () => {
    const schoolOnly = ids["school-register"];
    await expect(setCartLine(customer, schoolOnly.variant, 1)).rejects.toThrow();
    await CartLine.create({ customerId: customer, variantId: schoolOnly.variant, quantity: 1 });
    const { lines, unavailable } = await basketFor(customer);
    expect(lines).toHaveLength(0);
    expect(unavailable).toHaveLength(1);
    const list = await createList(customer, "Plans");
    await expect(saveListItem(customer, list, schoolOnly.variant, 1, true)).rejects.toThrow();
    expect(await describeItems([{ variantId: schoolOnly.variant, quantity: 1, addedBy: customer }])).toHaveLength(0);
    await expect(toggleWishlist(customer, schoolOnly.product)).rejects.toThrow("unavailable");
    await expect(ensureSaved(customer, schoolOnly.product)).rejects.toThrow("unavailable");
    // items for both still work
    await setCartLine(customer, ids["both-notebook"].variant, 2);
    expect((await basketFor(customer)).lines).toHaveLength(1);
  });

  it("lets staff choose who sees a product, but not nobody", async () => {
    const pen = ids["shop-pen"].product;
    await setProductAudience(admin, { productId: pen, showToCustomers: false, showToSchools: true });
    expect(await catalog({ slug: "shop-pen" })).toHaveLength(0);
    expect((await catalogForSchools()).some((item) => item.slug === "shop-pen")).toBe(true);
    await expect(
      setProductAudience(admin, { productId: pen, showToCustomers: false, showToSchools: false }),
    ).rejects.toThrow("Tick Customers, Schools or both");
    const audit = await AuditLog.findOne({ action: "product.audience", target: pen });
    expect(audit?.details).toEqual({
      before: { showToCustomers: true, showToSchools: false },
      after: { showToCustomers: false, showToSchools: true },
    });
  });

  it("lets only an owner set a school price; a blank box takes it off", async () => {
    const variant = ids["shop-pen"].variant;
    await expect(setSchoolPrice(admin, { variantId: variant, schoolPricePaise: 3000 })).rejects.toThrow("FORBIDDEN");
    await setSchoolPrice(owner, { variantId: variant, schoolPricePaise: 3000 });
    expect((await ProductVariant.findById(variant))?.schoolPricePaise).toBe(3000);
    await setSchoolPrice(owner, { variantId: variant, schoolPricePaise: "" });
    expect((await ProductVariant.findById(variant))?.schoolPricePaise).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: "variant.school-price", target: variant })).toBe(2);
  });

  it("saves a product's GST rate and HSN code, and a blank clears them", async () => {
    const pen = ids["shop-pen"].product;
    const details = {
      productId: pen,
      nameEn: "Gel pen",
      nameMr: "जेल पेन",
      descriptionEn: "A smooth gel pen",
      descriptionMr: "गुळगुळीत जेल पेन",
      brand: "",
      categoryId: String((await Product.findById(pen))!.categoryId),
      aliases: "",
      featured: false,
      bestseller: false,
    };
    await updateProductMetadata(admin, { ...details, gstRatePercent: "18", hsnCode: "96081019" });
    let product = await Product.findById(pen);
    expect([product?.gstRatePercent, product?.hsnCode]).toEqual([18, "96081019"]);
    await expect(updateProductMetadata(admin, { ...details, gstRatePercent: "12" })).rejects.toThrow();
    await updateProductMetadata(admin, { ...details, gstRatePercent: "", hsnCode: "" });
    product = await Product.findById(pen);
    expect([product?.gstRatePercent, product?.hsnCode]).toEqual([undefined, undefined]);
  });
});
