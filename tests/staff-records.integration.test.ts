import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, Product, ProductVariant, User } from "../src/lib/db/models";
import { rolesFor } from "../src/lib/auth/permissions";
import { findRecords } from "../src/lib/staff/records";

// The workspace search's real records: products, orders and customers as staff type.
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Workspace search records", () => {
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    const namkeen = await Category.create({ slug: "namkeen-papad", name: { en: "Namkeen & Papad", mr: "Namkeen & Papad" } });
    const pens = await Category.create({ slug: "pens", name: { en: "Pens", mr: "Pens" } });
    const make = async (slug: string, en: string, category: typeof pens, sku: string) => {
      const product = await Product.create({
        slug,
        name: { en, mr: en },
        description: { en, mr: en },
        categoryId: category._id,
        categorySlug: category.slug,
        status: "published",
      });
      await ProductVariant.create({ productId: product._id, sku, label: "1", unit: "piece", packQuantity: 1, pricePaise: 1000, mrpPaise: 1000 });
    };
    await make("ratlami-sev", "Agrawal's 420 Ratlami Sev, 400 g", namkeen, "FD-420-RATLAMI-400");
    await make("gel-pen", "Cello Gel Pen", pens, "ST-12");
    await User.create({ name: "Priya Patil", phone: "9876543210", roles: ["customer"] });
  });
  afterAll(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    await mongoose.disconnect();
  });
  const titles = async (query: string, role: "super-admin" | "delivery" = "super-admin") =>
    (await findRecords(query, rolesFor(role))).map((hit) => `${hit.kind}:${hit.title}`);

  it("finds products the shop's way: plurals, a category's name, a SKU, a near-miss spelling", async () => {
    expect(await titles("pens")).toContain("product:Cello Gel Pen");
    // "namkeen" is only in the category, not the product's name
    expect(await titles("namkeen")).toEqual(["product:Agrawal's 420 Ratlami Sev, 400 g"]);
    expect(await titles("ratlami-400")).toEqual(["product:Agrawal's 420 Ratlami Sev, 400 g"]);
    expect(await titles("ratlamy")).toEqual(["product:Agrawal's 420 Ratlami Sev, 400 g"]);
  });
  it("finds a customer by phone, however it's typed, and links to them", async () => {
    const [hit] = await findRecords("+91 98765 43210", rolesFor("super-admin"));
    expect(hit).toMatchObject({ kind: "customer", title: "Priya Patil", href: "/admin/customers?q=9876543210" });
  });
  it("shows each person only what they may open, and nothing for one letter", async () => {
    // a delivery partner opens neither the catalogue nor the order and customer lists
    expect(await titles("pens", "delivery")).toEqual([]);
    expect(await titles("9876543210", "delivery")).toEqual([]);
    expect(await titles("p")).toEqual([]);
  });
});
