import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { setProductVisibility, updateVariant } from "../src/lib/catalog/manage";
import { catalog } from "../src/lib/catalog/queries";
import { basketFor, setCartLine } from "../src/lib/commerce/service";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Showing, hiding and changing packs", () => {
  let admin: string, customer: string, productId: string, variantId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, CartLine]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    admin = String((await User.create({ name: "Staff", phone: "9000000061", roles: ["customer", "admin"] }))._id);
    customer = String((await User.create({ name: "Shopper", phone: "9000000062", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const product = await Product.create({
      slug: "notebook",
      name: { en: "Notebook", mr: "वही" },
      description: { en: "Notebook", mr: "वही" },
      categoryId: category._id,
      categorySlug: "paper",
      status: "published",
    });
    productId = String(product._id);
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: "NB-100",
      label: "100 pages",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 3000,
      mrpPaise: 3500,
    });
    variantId = String(variant._id);
    await InventoryItem.create({ variantId: variant._id, onHand: 20 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("hides a product and shows it again", async () => {
    await setProductVisibility(admin, { productId, visible: "hide" });
    expect(await catalog({ slug: "notebook" })).toHaveLength(0);
    await setProductVisibility(admin, { productId, visible: "show" });
    expect(await catalog({ slug: "notebook" })).toHaveLength(1);
  });

  it("won't show a product that has no pack to sell", async () => {
    await setProductVisibility(admin, { productId, visible: "hide" });
    await ProductVariant.updateOne({ _id: variantId }, { active: false });
    await expect(setProductVisibility(admin, { productId, visible: "show" })).rejects.toThrow("no pack to sell");
  });

  it("renames a pack, changes its limit, and hides it from the shop and baskets", async () => {
    await setCartLine(customer, variantId, 2);
    await updateVariant(admin, { variantId, label: "100-page notebook", maxQuantity: 30, active: true });
    const renamed = await ProductVariant.findById(variantId);
    expect(renamed?.label).toBe("100-page notebook");
    expect(renamed?.maxQuantity).toBe(30);
    await updateVariant(admin, { variantId, label: "100-page notebook", maxQuantity: 30, active: false });
    expect(await catalog({ slug: "notebook" })).toHaveLength(0); // no buyable pack left
    const basket = await basketFor(customer);
    expect(basket.lines).toHaveLength(0);
    expect(basket.unavailable[0]?.label).toBe("100-page notebook");
    await expect(setCartLine(customer, variantId, 1)).rejects.toThrow("unavailable");
  });
});
