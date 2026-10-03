// The fuller basket page, at desktop and phone width: the delivery banner and the goal bar, a
// suggested item added straight from the basket, a bill that adds up, and for a signed-in
// shopper "Buy it again" and "Save for later".
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Category, Product, ProductVariant, InventoryItem, ServiceArea } from "../../src/lib/db/models";
import { Address } from "../../src/lib/commerce/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const SHOPPER = { name: "Basket Shopper", email: "basket-shopper@e2e.test", phone: "9000000171" };
const out = process.env.SHOT_DIR;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const area = await ServiceArea.create({ key: "nagothane", name: "Nagothane", pincodes: ["999999"], enabled: true, feePaise: 3000 });
  const shopper = await User.create({ ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
  await Address.create({
    customerId: shopper._id,
    name: SHOPPER.name,
    phone: SHOPPER.phone,
    line: "Fictional House 9, Test Street",
    pin: "999999",
    areaId: area._id,
    isDefault: true,
  });
  const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
  const make = async (slug: string, name: string, price: number, mrp: number) => {
    const product = await Product.create({
      slug,
      name: { en: name, mr: name },
      description: { en: name, mr: name },
      brand: "TEST BRAND",
      categoryId: category._id,
      categorySlug: "stationery",
      status: "published",
      bestseller: true,
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: slug.toUpperCase(),
      label: "Pack of 4",
      unit: "piece",
      packQuantity: 4,
      pricePaise: price,
      mrpPaise: mrp,
    });
    await InventoryItem.create({ variantId: variant._id, onHand: 30 });
    return variant;
  };
  await make("fictional-marker-set", "Fictional Marker Set", 12000, 14500);
  await make("fictional-highlighter", "Fictional Highlighter", 6000, 6000);
  const pen = await make("fictional-gel-pen", "Fictional Gel Pen", 9900, 9900);
  // a past order, so "Buy it again" has something to show
  await mongoose.connection.collection("orders").insertOne({
    customerId: shopper._id,
    number: "AGS-E2E-BASKET-1",
    items: [{ variantId: pen._id, name: "Fictional Gel Pen", label: "Pack of 4", quantity: 1, pricePaise: 9900, linePaise: 9900 }],
    totalPaise: 9900,
    orderStatus: "completed",
    createdAt: new Date("2026-09-01T06:00:00Z"),
  });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function addMarkers(page: Page) {
  await page.goto("/products/fictional-marker-set");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.locator(".success-message")).toContainText("Basket updated");
  await page.goto("/cart");
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_basket-${name}.png`, fullPage: true });
}

test("a guest's basket shows delivery, the next goal, suggestions and a bill that adds up", async ({ page }) => {
  await addMarkers(page);
  await expect(page.getByText("Same-day delivery", { exact: true })).toBeVisible();
  // the basket keeps the search in the desktop header; a phone gives that row to the basket
  const search = page.getByRole("combobox", { name: "Search products" });
  if (test.info().project.name === "mobile") await expect(search).toBeHidden();
  else await expect(search).toBeVisible();
  await expect(page.getByLabel("Savings to unlock")).toContainText("Add ₹380 more for free delivery.");
  const items = page.getByRole("region", { name: "1 item" });
  await expect(items).toContainText("₹120 each ₹145");
  await expect(items).toContainText("You’re saving ₹25 on these items.");
  // guests can't save for later: that needs a wishlist, so an account
  await expect(page.getByRole("button", { name: "Save for later" })).toHaveCount(0);

  const more = page.getByRole("region", { name: "Add a little more" });
  await expect(more).toContainText("Fictional Highlighter");
  await shot(page, "guest");
  await more.getByRole("button", { name: "Add Fictional Highlighter to basket" }).click();
  // the new line and the bill appear without a reload
  await expect(page.getByRole("region", { name: "2 items" })).toContainText("Fictional Highlighter");
  const bill = page.locator(".basket-bill");
  await expect(bill).toContainText("Items total (MRP) ₹205");
  await expect(bill).toContainText("Discount on MRP −₹25");
  await expect(bill).toContainText("Delivery ₹30");
  await expect(bill.getByRole("heading", { name: /To pay/ })).toContainText("₹210");
  await expect(bill).toContainText("You save ₹25 on this order");
});

test("a signed-in shopper sees where it's going, buys again and saves for later", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(SHOPPER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });

  await addMarkers(page);
  await expect(page.getByText("Same-day delivery to Nagothane", { exact: true })).toBeVisible();
  const again = page.getByRole("region", { name: "Buy it again" });
  await expect(again).toContainText("Fictional Gel Pen");
  // shown once: what's in "Buy it again" isn't suggested again
  await expect(page.getByRole("region", { name: "Add a little more" })).not.toContainText("Fictional Gel Pen");
  await shot(page, "signed-in");
  // checkout is for finishing the order: no search there at any width
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search products" })).toHaveCount(0);
  await page.goto("/cart");

  await page.getByRole("button", { name: "Save for later" }).click();
  await expect(page.getByRole("heading", { name: "Your basket is empty." })).toBeVisible();
  await page.goto("/account/wishlist");
  await expect(page.getByText("Fictional Marker Set").first()).toBeVisible();
});
