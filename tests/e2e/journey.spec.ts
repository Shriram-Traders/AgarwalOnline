// The whole journey in one pass: sign up, shop, apply an offer, pay, pack,
// deliver and reconcile. It covers what the per-surface specs do not — the
// quantity stepper, promotion codes, populated list and table states — and
// fails if the browser logs an error, a request fails or the server 500s.
//
// Set SHOT_DIR to also write full-page screenshots of each populated screen,
// which is how the design pass reviews states the empty fixtures never reach.
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  ServiceArea,
} from "../../src/lib/db/models";
import { DeliverySlot } from "../../src/lib/commerce/models";
import { Promotion } from "../../src/lib/promotions/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const out = process.env.SHOT_DIR;
const PASSWORD = "Local-test-password-123";

/** Anything the browser reports as broken while we drive it. */
const problems: string[] = [];

function watch(page: Page, label: string) {
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${label} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${label} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (!failure.includes("ERR_ABORTED")) problems.push(`${label} requestfailed: ${request.url()} ${failure}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) problems.push(`${label} ${response.status()}: ${response.url()}`);
  });
}

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const category = await Category.create({
    slug: "staples",
    name: { en: "Staples", mr: "धान्य" },
  });
  const product = await Product.create({
    slug: "everyday-basmati-rice",
    name: { en: "Everyday Basmati Rice", mr: "रोजचा बासमती तांदूळ" },
    description: { en: "Fictional test rice", mr: "प्रात्यक्षिक तांदूळ" },
    brand: "PANTRY SELECT",
    categoryId: category._id,
    categorySlug: "staples",
    status: "published",
    aliases: ["chawal"],
  });
  const variant = await ProductVariant.create({
    productId: product._id,
    sku: "E2E-RICE",
    label: "1 kg",
    unit: "kg",
    packQuantity: 1,
    pricePaise: 10900,
    mrpPaise: 14000,
    maxQuantity: 10,
  });
  await InventoryItem.create({ variantId: variant._id, onHand: 40 });
  const area = await ServiceArea.create({
    key: "fictional-e2e",
    name: "Fictional test area",
    enabled: true,
    pincodes: ["999999"],
    feePaise: 3000,
  });
  await DeliverySlot.create({
    areaId: area._id,
    date: "2099-01-01",
    label: "4:00 PM – 7:00 PM",
    capacity: 5,
  });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const staff = await User.create([
    { phone: "9000000081", name: "Fictional Admin", email: "admin@e2e.test", roles: ["customer", "admin"], passwordHash },
    { phone: "9000000082", name: "Fictional Delivery", email: "delivery@e2e.test", roles: ["customer", "delivery"], passwordHash },
    { phone: "9000000083", name: "Fictional Owner", email: "owner@e2e.test", roles: ["customer", "super-admin"], passwordHash },
  ]);
  await Promotion.create({
    name: "Neighbourhood welcome",
    code: "LOCAL10",
    kind: "code",
    discountType: "percentage",
    discountValue: 10,
    minimumSubtotalPaise: 49900,
    startsAt: new Date("2020-01-01"),
    endsAt: new Date("2099-01-01"),
    active: true,
    createdBy: staff[2]._id,
    updatedBy: staff[2]._id,
  });
});

test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  if (!out) return;
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

async function staffSignIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL(/\/(admin|super-admin|delivery)/);
}

test("whole journey: sign up, shop, pay, pack, deliver, reconcile", async ({ browser }) => {
  test.slow();
  const shopper = await browser.newContext();
  const page = await shopper.newPage();
  watch(page, "customer");

  // --- sign up -----------------------------------------------------------
  await page.goto("/signup");
  await page.getByLabel("Email address").fill("neighbour@e2e.test");
  await page.getByLabel("Mobile number").fill("9000000088");
  await page.getByRole("button", { name: "Start account creation" }).click();
  await page.getByLabel("Your name").fill("Neighbour");
  await page.getByLabel("Create password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  // new customers land in the shop; the account is one tap away
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Neighbour" })).toBeVisible();

  // --- find a product ----------------------------------------------------
  await page.goto("/catalog?q=chawal");
  await expect(page.getByRole("heading", { name: "Everyday Basmati Rice" })).toBeVisible();
  await page.getByRole("link", { name: /Everyday Basmati Rice/ }).first().click();
  await expect(page).toHaveURL(/\/products\/everyday-basmati-rice/);
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.locator(".success-message")).toContainText("Basket updated");

  // --- basket: stepper, free-delivery meter, promo code ------------------
  await page.goto("/cart");
  const plus = page.getByRole("button", { name: "Increase quantity" });
  for (let i = 0; i < 4; i += 1) {
    await plus.click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator(".qty-stepper output")).toHaveText("5");
  // coupons sit behind one line; its popup has a box for any code above the shop's own offers
  await page.locator("#offers").getByRole("button", { name: /Apply a coupon/ }).click();
  const coupons = page.getByRole("dialog", { name: "Coupons" });
  await coupons.getByLabel("Enter a coupon code").fill("LOCAL10");
  await coupons.locator(".coupon-entry").getByRole("button", { name: "Apply" }).click();
  await expect(coupons).toBeHidden();
  await expect(page.locator("#offers")).toContainText("LOCAL10 applied");
  await expect(page.locator(".savings-line")).toHaveCount(2);
  await shot(page, "cart-populated");

  // --- address and checkout ----------------------------------------------
  await page.goto("/account/addresses");
  await page.getByLabel("Recipient name").fill("Fictional Neighbour");
  await page.getByLabel("Mobile number").fill("9000000088");
  await page.getByLabel("House, building, street").fill("Fictional House 1, Test Street");
  await page.getByLabel("PIN code").fill("999999");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.locator(".success-message")).toContainText("Address saved");
  await shot(page, "addresses-populated");

  await page.goto("/checkout");
  await page.getByLabel("Delivery slot").selectOption({ label: "Thu, 1 Jan · 4:00 PM – 7:00 PM" });
  await shot(page, "checkout-populated");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm Cash on Delivery order" }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[a-f0-9]+/);
  const orderUrl = page.url();
  await expect(page.getByText(/^Status: Order placed$/i)).toBeVisible();
  await shot(page, "order-detail-placed");

  // --- the account now has history ---------------------------------------
  await page.goto("/account");
  await shot(page, "account-populated");
  await page.goto("/account/orders");
  await expect(page.locator(".order-history-row")).toHaveCount(1);
  await shot(page, "orders-populated");
  await page.goto("/account/notifications");
  await shot(page, "notifications-populated");

  // --- admin sees it in the table ----------------------------------------
  const office = await browser.newContext();
  const admin = await office.newPage();
  watch(admin, "admin");
  await staffSignIn(admin, "admin@e2e.test");
  await expect(admin.locator(".data-table tbody tr")).toHaveCount(1);
  await shot(admin, "admin-orders-populated");

  await admin.locator(".data-table tbody tr a").first().click();
  await expect(admin).toHaveURL(/\/admin\/orders\/[a-f0-9]+/);
  await shot(admin, "admin-order-detail");
  await admin.getByRole("button", { name: "Confirm order", exact: true }).click();
  await expect(admin.locator(".status-strip")).toContainText(/confirmed/i);
  await admin.getByRole("button", { name: "Start picking" }).click();
  await admin.getByLabel("Packed quantity").fill("5");
  await admin.getByRole("button", { name: "Save packing checklist" }).click();
  await expect(admin.getByText("All quantities checked.")).toBeVisible();
  await admin.getByRole("button", { name: "Mark packed" }).click();
  await admin.getByRole("button", { name: "Ready for pickup" }).click();
  await admin
    .getByRole("combobox", { name: "Partner", exact: true })
    .selectOption({ label: "Fictional Delivery" });
  await admin.getByRole("button", { name: "Assign delivery", exact: true }).click();
  await expect(admin.getByText("delivery: unassigned → assigned")).toBeVisible();
  await shot(admin, "admin-order-packed");

  // --- the partner delivers ----------------------------------------------
  const van = await browser.newContext();
  const rider = await van.newPage();
  watch(rider, "delivery");
  await staffSignIn(rider, "delivery@e2e.test");
  await expect(rider.locator(".stop-row")).toHaveCount(1);
  await shot(rider, "delivery-queue-populated");
  await rider.locator(".stop-row").first().click();
  await rider.getByRole("button", { name: "Start delivery", exact: true }).click();
  await expect(rider.getByLabel("Customer delivery code")).toBeVisible();
  await shot(rider, "delivery-order-detail");

  // the customer asks for the code, the partner enters it
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Request delivery confirmation code" }).click();
  await expect(page.getByText("Development delivery code: 246810")).toBeVisible();
  await rider.getByLabel("Customer delivery code").fill("246810");
  await rider.getByRole("checkbox").check();
  await rider.getByRole("button", { name: "Verify code & mark delivered" }).click();
  await expect(rider).toHaveURL("/delivery");

  await admin.goto(orderUrl.replace("/account/orders/", "/admin/orders/"));
  await admin.getByRole("button", { name: "Complete order", exact: true }).click();
  await admin.getByRole("button", { name: "Record cash handover" }).click();
  await admin.getByRole("button", { name: /^Yes, / }).click();
  await expect(admin.getByText("Cash reconciled", { exact: true })).toBeVisible();

  // --- cash comes back to the desk ---------------------------------------
  await admin.goto("/admin/cod");
  await expect(admin.locator(".data-table tbody tr")).toHaveCount(1);
  await shot(admin, "cod-populated");

  // --- the customer can track and reorder --------------------------------
  await page.goto(orderUrl);
  await expect(page.getByText(/^Status: Delivered$/i)).toBeVisible();
  await shot(page, "order-detail-delivered");

  expect(problems, `browser reported:\n${problems.join("\n")}`).toEqual([]);
  await shopper.close();
  await office.close();
  await van.close();
});
