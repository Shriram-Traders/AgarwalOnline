import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { WishlistItem } from "../src/lib/engagement/models";
import { saveForLater } from "../src/lib/commerce/save-for-later";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Save for later on the basket", () => {
  let shopper: string, other: string, productId: string, variantId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, CartLine, WishlistItem]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    shopper = String((await User.create({ name: "Asha", phone: "9000000161", roles: ["customer"] }))._id);
    other = String((await User.create({ name: "Ravi", phone: "9000000162", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
    const product = await Product.create({
      slug: "marker-set",
      name: { en: "Marker Set", mr: "मार्कर संच" },
      description: { en: "Markers", mr: "मार्कर" },
      categoryId: category._id,
      categorySlug: "stationery",
      status: "published",
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: "MARKER-4",
      label: "Pack of 4",
      unit: "piece",
      packQuantity: 4,
      pricePaise: 12000,
      mrpPaise: 14500,
    });
    await InventoryItem.create({ variantId: variant._id, onHand: 20 });
    productId = String(product._id);
    variantId = String(variant._id);
    await CartLine.create({ customerId: shopper, variantId, quantity: 3 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("moves the item to the wishlist and takes it out of the basket", async () => {
    await saveForLater(shopper, variantId);
    expect(await WishlistItem.exists({ customerId: shopper, productId })).not.toBeNull();
    expect(await CartLine.countDocuments({ customerId: shopper })).toBe(0);
    // saving again, after it's already gone from the basket, says so plainly
    await expect(saveForLater(shopper, variantId)).rejects.toThrow("no longer in your basket");
  });

  it("only touches the shopper's own basket", async () => {
    await expect(saveForLater(other, variantId)).rejects.toThrow("no longer in your basket");
    expect(await CartLine.countDocuments({ customerId: shopper })).toBe(1);
    expect(await WishlistItem.countDocuments({})).toBe(0);
  });

  it("keeps the item in the basket when the product can't be saved", async () => {
    await Product.updateOne({ _id: productId }, { $set: { status: "hidden" } });
    await expect(saveForLater(shopper, variantId)).rejects.toThrow("This product is unavailable.");
    expect(await CartLine.countDocuments({ customerId: shopper })).toBe(1);
  });
});
