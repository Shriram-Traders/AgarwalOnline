// The shop assistant in the corner, at desktop and phone width: a guest asks about delivery,
// finds a product and adds it; "talk to the store" asks a guest to sign in; a signed-in shopper
// lands in the live chat with their question already sent. On phones the button stays clear of
// the tab bar and the basket bar.
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Category, Product, ProductVariant, InventoryItem, ServiceArea } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const SHOPPER = { name: "Assistant Shopper", email: "assistant-shopper@e2e.test", phone: "9000000151" };
const out = process.env.SHOT_DIR;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await User.create({ ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
  await ServiceArea.create({ key: "nagothane", name: "Nagothane", pincodes: ["402106"], enabled: true, feePaise: 3000 });
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
    sku: "E2E-ASSIST-PEN",
    label: "Pack of 5",
    unit: "piece",
    packQuantity: 5,
    pricePaise: 4900,
    mrpPaise: 6000,
  });
  await InventoryItem.create({ variantId: variant._id, onHand: 40 });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function openAssistant(page: Page) {
  await page.getByRole("button", { name: "Ask the shop assistant" }).click();
  const chat = page.getByRole("dialog", { name: "Agarwal assistant" });
  await expect(chat).toBeVisible();
  return chat;
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_assistant-${name}.png` });
}

test("a guest asks about delivery, finds a pen and adds it", async ({ page }) => {
  await page.goto("/");
  const chat = await openAssistant(page);
  await chat.getByRole("button", { name: "Delivery areas and times" }).click();
  await expect(chat.getByText("We deliver same day to Nagothane.", { exact: false })).toBeVisible();

  await chat.getByLabel("Ask anything, or type what you need").fill("do you have gel pens?");
  await chat.getByLabel("Ask anything, or type what you need").press("Enter");
  await expect(chat.getByRole("link", { name: /Fictional Gel Pen/ })).toBeVisible();
  await chat.getByRole("button", { name: "Add Fictional Gel Pen to basket" }).click();
  await expect(chat.getByLabel("Quantity of Fictional Gel Pen in basket")).toContainText("1");
  await shot(page, "open");

  await chat.getByRole("button", { name: "Talk to the store" }).first().click();
  await expect(chat.getByText("Sign in to chat with the store team.", { exact: false })).toBeVisible();
  await expect(chat.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?then=%2F");

  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await expect(page.getByRole("button", { name: "Ask the shop assistant" })).toBeFocused();

  if (test.info().project.name === "mobile") {
    // the button sits above the basket bar, which sits above the tab bar
    const button = (await page.getByRole("button", { name: "Ask the shop assistant" }).boundingBox())!;
    const basketBar = (await page.locator(".cart-bar").boundingBox())!;
    const tabs = (await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(basketBar.y);
    expect(basketBar.y + basketBar.height).toBeLessThanOrEqual(tabs.y);
    await shot(page, "closed");
  }
});

test("the chat stays with the shopper from page to page", async ({ page }) => {
  await page.goto("/");
  let chat = await openAssistant(page);
  await chat.getByRole("button", { name: "Payment" }).click();
  await expect(chat.getByText("You can pay cash on delivery", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/catalog");
  chat = await openAssistant(page);
  await expect(chat.getByText("You can pay cash on delivery", { exact: false })).toBeVisible();
  await chat.getByRole("button", { name: "Start over" }).click();
  await expect(chat.getByText("You can pay cash on delivery", { exact: false })).toHaveCount(0);
});

test("a signed-in shopper is passed to the live chat with the question already sent", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(SHOPPER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });

  const question = "Please talk to me about 200 notebooks for next week";
  const chat = await openAssistant(page);
  await chat.getByLabel("Ask anything, or type what you need").fill(question);
  await chat.getByRole("button", { name: "Send" }).click();
  await chat.getByRole("button", { name: "Chat with the store" }).click();
  await expect(page).toHaveURL(/\/account\/support\/[a-f\d]{24}$/);
  await expect(page.getByText(question).first()).toBeVisible();
  // the live chat has its own page, so the corner button steps aside there
  await expect(page.getByRole("button", { name: "Ask the shop assistant" })).toHaveCount(0);
});
