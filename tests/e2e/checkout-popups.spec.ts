// Checkout for someone new: the basket asks them to sign in or join in a popup, checkout asks
// for an address in a popup, and both bring them straight back. Also the coupons (one line on
// the basket and at checkout, opening a popup with a box for any code and the shop's own codes)
// and the Back button.
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
const PASSWORD = "Local-test-password-123";
const out = process.env.SHOT_DIR;

/** With SHOT_DIR set, a screenshot of what the shopper sees, for the design check. */
async function shot(page: Page, name: string) {
  if (!out) return;
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${test.info().project.name}_popups-${name}.png` });
}

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
  const product = await Product.create({
    slug: "fictional-gel-pen",
    name: { en: "Fictional Gel Pen", mr: "प्रात्यक्षिक जेल पेन" },
    description: { en: "Fictional test pen", mr: "प्रात्यक्षिक पेन" },
    brand: "TEST BRAND",
    categoryId: category._id,
    categorySlug: "stationery",
    status: "published",
  });
  const variant = await ProductVariant.create({
    productId: product._id,
    sku: "E2E-PEN",
    label: "Pack of 10",
    unit: "piece",
    packQuantity: 10,
    pricePaise: 10900,
    mrpPaise: 12000,
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
  await DeliverySlot.create({ areaId: area._id, date: "2099-01-01", label: "4:00 PM – 7:00 PM", capacity: 5 });
  const owner = await User.create({
    phone: "9000000083",
    name: "Fictional Owner",
    email: "owner@e2e.test",
    roles: ["customer", "super-admin"],
    passwordHash: await bcrypt.hash(PASSWORD, 12),
  });
  const offer = {
    kind: "code",
    discountType: "percentage",
    discountValue: 10,
    startsAt: new Date("2020-01-01"),
    endsAt: new Date("2099-01-01"),
    active: true,
    createdBy: owner._id,
    updatedBy: owner._id,
  };
  await Promotion.create([
    { ...offer, name: "Neighbourhood welcome", code: "LOCAL10", minimumSubtotalPaise: 49900 },
    // private: works when typed, never listed
    { ...offer, name: "Friends of the shop", code: "FRIEND5", discountValue: 5, listed: false },
  ]);
});

test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("a new shopper signs up and adds an address from checkout popups, then uses the shop's offers", async ({
  page,
}) => {
  test.slow();
  // a guest fills the basket
  await page.goto("/products/fictional-gel-pen");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.locator(".success-message")).toContainText("Basket updated");
  await page.goto("/cart");

  // the basket shows one line for coupons; tapping it opens the box for any code and the shop's
  // own codes; private codes are not listed
  const offers = page.locator("#offers");
  const preview = offers.getByRole("button", { name: /Apply a coupon/ });
  await expect(preview).toContainText("Add ₹390 more to unlock an offer");
  await offers.scrollIntoViewIfNeeded();
  await shot(page, "basket-coupon-row");
  await preview.click();
  const coupons = page.getByRole("dialog", { name: "Coupons" });
  await expect(coupons.getByLabel("Enter a coupon code")).toBeVisible();
  const local = coupons.locator(".offer-card", { hasText: "LOCAL10" });
  await expect(local).toContainText("Add ₹390 more");
  await expect(coupons).not.toContainText("FRIEND5");
  await shot(page, "basket-coupons");
  await coupons.getByRole("button", { name: "Close" }).click();
  await expect(coupons).toBeHidden();

  // checking out without an account asks to sign in or join, right there
  await page.getByRole("button", { name: "Sign in to checkout" }).click();
  const join = page.getByRole("dialog", { name: "Sign in to place your order" });
  await expect(join).toBeVisible();
  await shot(page, "sign-in-popup");
  await expect(join.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?then=%2Fcheckout");
  await join.getByRole("link", { name: "Create an account" }).click();

  await expect(page).toHaveURL("/signup?then=%2Fcheckout");
  await page.getByLabel("Email address").fill("new-shopper@e2e.test");
  await page.getByLabel("Mobile number").fill("9000000077");
  await page.getByRole("button", { name: "Start account creation" }).click();
  await page.getByLabel("Your name").fill("New Shopper");
  await page.getByLabel("Create password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify & continue" }).click();

  // straight back to checkout, where the address form pops up
  await expect(page).toHaveURL("/checkout");
  const where = page.getByRole("dialog", { name: "Where should we deliver?" });
  await expect(where).toBeVisible();
  await expect(where.getByLabel("Mobile number")).toHaveValue("9000000077");
  await where.getByLabel("Recipient name").fill("New Shopper");
  await where.getByLabel("House, building, street").fill("Fictional House 7, Test Street");
  await where.getByLabel("PIN code").fill("111111");
  await expect(where).toContainText("We don’t deliver to PIN 111111 yet");
  await shot(page, "address-popup");
  await where.getByLabel("PIN code").fill("999999");
  await expect(where.getByLabel("Area")).toHaveValue(/[a-f0-9]{24}/);
  await where.getByRole("button", { name: "Save address & continue" }).click();
  await expect(where).toBeHidden();
  await expect(page.getByLabel("Delivery address")).toContainText("New Shopper — Fictional House 7, Test Street, 999999");
  await expect(page.getByLabel("Delivery slot")).toBeVisible();
  await shot(page, "checkout-after-address");

  // a basket big enough for LOCAL10: apply it from the list, then take it off again
  await page.goto("/cart");
  const plus = page.getByRole("button", { name: "Increase quantity" });
  for (let i = 0; i < 4; i += 1) {
    await plus.click();
    await page.waitForTimeout(400);
  }
  await page.reload();
  await expect(offers.getByRole("button", { name: /Apply a coupon/ })).toContainText("1 offer available");
  await offers.getByRole("button", { name: /Apply a coupon/ }).click();
  await local.getByRole("button", { name: "Apply" }).click();
  // a code that goes on closes the popup, and the line shows the saving
  await expect(coupons).toBeHidden();
  const applied = offers.getByRole("button", { name: /LOCAL10 applied/ });
  await expect(applied).toContainText("You save ₹54.5");
  await expect(page.locator(".savings-line", { hasText: "Neighbourhood welcome" })).toBeVisible();
  await offers.scrollIntoViewIfNeeded();
  await shot(page, "basket-coupon-applied");
  await applied.click();
  await expect(local).toContainText("Applied");
  await coupons.getByRole("button", { name: "Close" }).click();
  await offers.getByRole("button", { name: "Remove" }).click();
  await expect(offers.getByRole("button", { name: /Apply a coupon/ })).toBeVisible();

  // a private code still works when typed in the box at the top
  await offers.getByRole("button", { name: /Apply a coupon/ }).click();
  await coupons.getByLabel("Enter a coupon code").fill("friend5");
  await coupons.locator(".coupon-entry").getByRole("button", { name: "Apply" }).click();
  await expect(coupons).toBeHidden();
  await expect(offers.getByRole("button", { name: /FRIEND5 applied/ })).toBeVisible();
  // a made-up code is refused inside the popup, which stays open
  await offers.getByRole("button", { name: /FRIEND5 applied/ }).click();
  await coupons.getByLabel("Enter a coupon code").fill("NOSUCH");
  await coupons.locator(".coupon-entry").getByRole("button", { name: "Apply" }).click();
  await expect(coupons.getByRole("alert")).toBeVisible();
  await coupons.getByRole("button", { name: "Close" }).click();

  // checkout carries the same line, and the same popup
  await page.goto("/checkout");
  const atCheckout = page.locator("#offers");
  await expect(atCheckout.getByRole("button", { name: /FRIEND5 applied/ })).toBeVisible();
  await shot(page, "checkout-coupon-row");
  await atCheckout.getByRole("button", { name: /FRIEND5 applied/ }).click();
  await expect(page.getByRole("dialog", { name: "Coupons" }).locator(".offer-card", { hasText: "LOCAL10" })).toBeVisible();
  // Enter in the code box applies the code; it must never place the order around it
  const atCheckoutCoupons = page.getByRole("dialog", { name: "Coupons" });
  await atCheckoutCoupons.getByLabel("Enter a coupon code").fill("local10");
  await atCheckoutCoupons.getByLabel("Enter a coupon code").press("Enter");
  await expect(atCheckoutCoupons).toBeHidden();
  await expect(atCheckout.getByRole("button", { name: /LOCAL10 applied/ })).toBeVisible();
  await expect(page).toHaveURL("/checkout");
  await expect(page.locator(".savings-line", { hasText: "Neighbourhood welcome" })).toBeVisible();
});

test("Back returns to the previous page, or one level up when opened from a link", async ({ page }) => {
  // opened straight from a link: no earlier page of the shop, so Back goes up a level
  await page.goto("/products/fictional-gel-pen");
  await shot(page, "product-back-button");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/catalog");
  // the home page is where Back ends
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  // after moving around the shop it goes back the way the shopper came
  await page.goto("/catalog");
  await page.getByRole("link", { name: /Fictional Gel Pen/ }).first().click();
  await expect(page).toHaveURL(/\/products\/fictional-gel-pen/);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/catalog");
});

test("checkout opened without an account pops up the sign-in choice", async ({ page }) => {
  await page.goto("/checkout");
  const join = page.getByRole("dialog", { name: "Sign in to place your order" });
  await expect(join).toBeVisible();
  // focus moves into the popup once the page is live, so keyboard and screen reader users land in it
  await expect(join).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(join).toBeHidden();
  // closing it leaves the same choice on the page
  await expect(page.locator("main").getByRole("link", { name: "Create an account" })).toBeVisible();
});
