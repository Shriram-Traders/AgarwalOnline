import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, Product, ProductVariant, User } from "../src/lib/db/models";
import { Order } from "../src/lib/commerce/models";
import { ProductReview } from "../src/lib/reviews/models";
import { reviewForOwner, reviewsForOwner, saveReview } from "../src/lib/reviews/service";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Product reviews", () => {
  let asha: string, ravi: string, owner: string, productId: string, variantId: string, otherProductId: string;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, Order, ProductReview]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    asha = String((await User.create({ name: "Asha Patil", phone: "9000000191", roles: ["customer"] }))._id);
    ravi = String((await User.create({ name: "Ravi Joshi", phone: "9000000192", roles: ["customer"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000193", roles: ["customer", "super-admin"] }))._id);
    const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
    const make = async (slug: string, name: string) => {
      const product = await Product.create({
        slug,
        name: { en: name, mr: name },
        description: { en: name, mr: name },
        categoryId: category._id,
        categorySlug: "stationery",
        status: "published",
      });
      const variant = await ProductVariant.create({
        productId: product._id,
        sku: slug.toUpperCase(),
        label: "Pack of 5",
        unit: "piece",
        packQuantity: 5,
        pricePaise: 9900,
        mrpPaise: 9900,
      });
      return { product: String(product._id), variant: String(variant._id) };
    };
    const pens = await make("gel-pen-set", "Gel Pen Set");
    productId = pens.product;
    variantId = pens.variant;
    otherProductId = (await make("marker-set", "Marker Set")).product;
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function delivered(customerId: string, key: string) {
    await Order.create({
      customerId,
      number: `AGS-RV-${key}`,
      idempotencyKey: `review-${key}`,
      slotId: new mongoose.Types.ObjectId(),
      items: [{ variantId, name: "Gel Pen Set", label: "Pack of 5", quantity: 1, pricePaise: 9900, linePaise: 9900 }],
      totalPaise: 9900,
      paymentMethod: "cod",
      orderStatus: "confirmed",
      deliveryStatus: "delivered",
    });
  }

  it("is only for someone the product was delivered to", async () => {
    expect(await saveReview(asha, { productId, rating: 5, title: "Great", body: "" })).toBeNull();
    await delivered(asha, "1");
    expect(await saveReview(asha, { productId, rating: 5, title: "Great", body: "Smooth ink" })).toBe("published");
    // a different product, never delivered to them
    expect(await saveReview(asha, { productId: otherProductId, rating: 5, title: "", body: "" })).toBeNull();
    expect(await ProductReview.countDocuments({})).toBe(1);
  });

  it("keeps a review the shop hid hidden when its writer edits it", async () => {
    await delivered(asha, "1");
    await saveReview(asha, { productId, rating: 1, title: "Rubbish", body: "Unfair words" });
    await ProductReview.updateOne({ customerId: asha, productId }, { $set: { status: "hidden", moderationReason: "Abusive" } });
    expect(await saveReview(asha, { productId, rating: 2, title: "Still cross", body: "Edited" })).toBe("hidden");
    const review = await ProductReview.findOne({ customerId: asha, productId });
    expect(review).toMatchObject({ status: "hidden", rating: 2, title: "Still cross", moderationReason: "Abusive" });
    expect(await ProductReview.countDocuments({})).toBe(1);
  });

  it("shows the owner every review, shown or hidden, and finds one by its words", async () => {
    await delivered(asha, "1");
    await delivered(ravi, "2");
    await saveReview(asha, { productId, rating: 5, title: "Great pens", body: "Smooth ink" });
    await saveReview(ravi, { productId, rating: 2, title: "Leaky", body: "Two were dry" });
    await ProductReview.updateOne({ customerId: ravi }, { $set: { status: "hidden", moderationReason: "Being checked" } });

    const all = await reviewsForOwner(owner, {});
    expect(all).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(all.rows.map((row) => row.status).sort()).toEqual(["hidden", "published"]);
    expect(all.rows.find((row) => row.status === "hidden")).toMatchObject({
      product: "Gel Pen Set",
      slug: "gel-pen-set",
      customer: "Ravi Joshi",
      rating: 2,
      moderationReason: "Being checked",
    });
    expect((await reviewsForOwner(owner, { rating: 5 })).rows.map((row) => row.title)).toEqual(["Great pens"]);
    for (const q of ["leaky", "ravi", "dry"]) expect((await reviewsForOwner(owner, { q })).rows.map((row) => row.title), q).toEqual(["Leaky"]);
    expect((await reviewsForOwner(owner, { q: "gel pen" })).total).toBe(2);
    expect((await reviewsForOwner(owner, { q: "stapler" })).total).toBe(0);
    expect((await reviewForOwner(all.rows[0].id))?.product).toBe("Gel Pen Set");
    expect(await reviewForOwner("not-an-id")).toBeNull();
    await expect(reviewsForOwner(asha, {})).rejects.toThrow("FORBIDDEN");
  });
});
