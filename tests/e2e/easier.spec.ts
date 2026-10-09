// Round 1 of "easier to use", at desktop and phone width: the product page's − / + stepper, hearts
// that remember, Load more, recent and popular searches, the packing slip, the new-order sound and
// stock from a spreadsheet. (Delivery time buttons are in store.spec, the rider's Call and Map in
// journey.spec.)
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { Address, Order } from "../../src/lib/commerce/models";
import { WishlistItem } from "../../src/lib/engagement/models";
import { OrderFeedback } from "../../src/lib/feedback/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const EMAILS = { customer: "customer@demo.ags.test", owner: "super-admin@demo.ags.test" };
const out = process.env.SHOT_DIR;

test.describe.configure({ mode: "serial" });

let product: { slug: string; name: string; label: string };
let order: { id: string; number: string };

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--demo-accounts"], {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
      APP_ORIGIN: "http://127.0.0.1:3002",
      SEED_DEMO: "true",
      NODE_ENV: "test",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const customer = await User.findOneAndUpdate({ roles: ["customer"] }, { email: EMAILS.customer, passwordHash }, { returnDocument: "after" });
  await User.updateMany({ email: EMAILS.owner }, { passwordHash });
  await Order.updateMany({}, { customerId: customer!._id });
  await Address.updateMany({}, { customerId: customer!._id });
  // no "How did we do?" popup over the pages
  for (const delivered of await Order.find({ deliveryStatus: "delivered" }).select("number"))
    await OrderFeedback.updateOne(
      { orderId: delivered._id },
      { $setOnInsert: { orderNumber: delivered.number, state: "skipped" } },
      { upsert: true },
    );

  // a pack with plenty on the shelf for the stepper
  const variant = (await ProductVariant.findOne({ active: { $ne: false } }).sort({ sku: 1 }))!;
  await InventoryItem.updateOne({ variantId: variant._id }, { onHand: 50, reserved: 0 });
  const owner = (await Product.findById(variant.productId))!;
  product = { slug: owner.slug, name: owner.name.en, label: variant.label };

  // more than one page of the catalogue (48), so Load more shows
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, updatedAt, __v, ...template } = owner.toObject();
  for (let index = 1; index <= 12; index++) {
    const extra = await Product.create({
      ...template,
      slug: `load-more-pen-${index}`,
      name: { en: `Load more pen ${index}`, mr: `पेन ${index}` },
    });
    const pack = await ProductVariant.create({
      productId: extra._id,
      sku: `LOAD-MORE-${index}`,
      label: "1 pen",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 1000,
      mrpPaise: 1200,
    });
    await InventoryItem.create({ variantId: pack._id, onHand: 10 });
  }

  const seeded = (await Order.findOne({ orderStatus: { $ne: "cancelled" } }).sort({ createdAt: -1 }))!;
  order = { id: String(seeded._id), number: seeded.number };
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, who: keyof typeof EMAILS, use: TestInfo["project"]["use"]): Promise<Page> {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(EMAILS[who]);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_easier-${name}.png`, fullPage: true });
}

test("product page: Add to basket becomes − “N in basket” +", async ({ page }) => {
  await page.goto(`/products/${product.slug}`);
  const main = page.locator("main");
  const full = `${product.name} (${product.label})`;
  await main.getByRole("button", { name: "Add to basket" }).first().click();
  await expect(main.getByText("1 in basket")).toBeVisible();
  await main.getByRole("button", { name: `One more ${full}` }).click();
  await expect(main.getByText("2 in basket")).toBeVisible();
  // tapping again adds one more: it never starts over at a typed number
  await main.getByRole("button", { name: `One more ${full}` }).click();
  await expect(main.getByText("3 in basket")).toBeVisible();
  await shot(page, "product-stepper");
  // the number shows at once; the basket keeps it once the store has saved it
  await expect(main.locator(".product-quantity").first()).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(main.getByText("3 in basket")).toBeVisible();
  await main.getByRole("button", { name: `One fewer ${full}` }).click();
  await main.getByRole("button", { name: `One fewer ${full}` }).click();
  await expect(main.getByText("1 in basket")).toBeVisible();
  await main.getByRole("button", { name: `Remove ${full} from basket` }).click();
  await expect(main.getByRole("button", { name: "Add to basket" }).first()).toBeVisible();
});

test("catalogue: Load more shows the rest under the first page", async ({ page }) => {
  await page.goto("/catalog");
  const main = page.locator("main");
  await expect(main.locator(".results-line")).toContainText("Showing 48 of");
  const total = Number(/of (\d+)/.exec(await main.locator(".results-line p").innerText())![1]);
  expect(total).toBeGreaterThan(48);
  await expect(main.locator(".product-grid > *")).toHaveCount(48);
  await main.getByRole("link", { name: `Load ${total - 48} more` }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(main.locator(".product-grid > *")).toHaveCount(total);
  await expect(main.getByRole("link", { name: /^Load \d+ more/ })).toHaveCount(0);
});

test("search: popular searches before typing, then your recent ones", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("header").getByRole("combobox");
  await search.click();
  const start = page.getByRole("region", { name: "Popular searches" });
  await expect(start.getByRole("link", { name: "pens" })).toBeVisible();
  await shot(page, "search-popular");
  await start.getByRole("link", { name: "pens" }).click();
  await expect(page).toHaveURL(/\/catalog\?q=pens/);
  await search.click();
  const recent = page.getByRole("region", { name: "Recent searches" });
  await expect(recent.getByRole("link", { name: "pens" })).toBeVisible();
  await recent.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("region", { name: "Recent searches" })).toHaveCount(0);
});

test("hearts show what the shopper saved, after a reload too", async ({ browser }, info) => {
  const page = await signedIn(browser, "customer", info.project.use);
  await WishlistItem.deleteMany({});
  await page.goto("/catalog?q=load more pen 1");
  const card = page.locator("main .product-grid > *").first();
  await card.getByRole("button", { name: /^Save .* to wishlist$/ }).click();
  await expect(card.getByRole("button", { name: /^Remove .* from wishlist$/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const again = page.locator("main .product-grid > *").first();
  await expect(again.getByRole("button", { name: /^Remove .* from wishlist$/ })).toHaveAttribute("aria-pressed", "true");
  expect(await WishlistItem.countDocuments()).toBe(1);
  await page.context().close();
});

test("staff: a packing slip and the bill from the order page", async ({ browser }, info) => {
  const page = await signedIn(browser, "owner", info.project.use);
  await page.goto(`/admin/orders/${order.id}`);
  await page.locator("main").getByRole("link", { name: "Packing slip" }).click();
  await expect(page).toHaveURL(`/admin/orders/${order.id}/slip`);
  const slip = page.locator("article.packing-slip");
  await expect(slip.getByRole("heading", { level: 1 })).toHaveText(order.number);
  await expect(slip.getByRole("heading", { name: "Deliver to" })).toBeVisible();
  await expect(slip.locator(".slip-lines tbody tr")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print packing slip" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the bill" })).toHaveAttribute("href", `/api/invoices/${order.id}`);
  await shot(page, "packing-slip");
  // the printed page is the slip alone
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".slip-actions").first()).toBeHidden();
  await expect(page.locator("header.staff-header")).toBeHidden();
  await page.context().close();
});

test("staff: the new-order sound hears of a new order", async ({ browser }, info) => {
  const page = await signedIn(browser, "owner", info.project.use);
  await page.goto("/admin");
  const sound = page.getByRole("button", { name: "New-order sound" });
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  // the first ask only learns what's already waiting
  await page.waitForResponse((response) => response.url().includes("/api/staff/new-orders"));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, updatedAt, __v, assignedTo, ...template } = (await Order.findById(order.id))!.toObject();
  const number = `AGS-E2E-ALERT-${info.project.name}`;
  const fresh = await Order.create({
    ...template,
    number,
    idempotencyKey: `e2e-alert-${info.project.name}`,
    orderStatus: "placed",
    paymentStatus: "pending",
    paymentMethod: "cod",
    codStatus: "uncollected",
    fulfilmentStatus: "unassigned",
    deliveryStatus: "unassigned",
  });
  const toast = page.getByRole("alert").filter({ hasText: number });
  await expect(toast).toBeVisible({ timeout: 35_000 });
  // at the bottom of the screen, not caught inside the header
  const box = (await toast.boundingBox())!;
  expect(box.y).toBeGreaterThan(page.viewportSize()!.height / 2);
  await shot(page, "order-alert");
  await toast.getByRole("link", { name: "Open the order" }).click();
  await expect(page).toHaveURL(`/admin/orders/${fresh._id}`);
  // remembered in this browser, and switched off again
  await expect(page.getByRole("button", { name: "New-order sound" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "New-order sound" }).click();
  await expect(page.getByRole("button", { name: "New-order sound" })).toHaveAttribute("aria-pressed", "false");
  await Order.deleteOne({ _id: fresh._id });
  await page.context().close();
});

test("staff: stock from a spreadsheet", async ({ browser }, info) => {
  const page = await signedIn(browser, "owner", info.project.use);
  const sheet = await page.request.get("/api/staff/stock-sheet");
  expect(sheet.ok()).toBe(true);
  expect(sheet.headers()["content-disposition"]).toMatch(/attachment; filename="stock-\d{4}-\d{2}-\d{2}\.csv"/);
  expect((await sheet.text()).split("\r\n")[0]).toBe("sku,product,pack,on_shelf,count,change,reason");

  const pack = (await ProductVariant.findOne({ sku: "LOAD-MORE-1" }))!;
  const before = (await InventoryItem.findOne({ variantId: pack._id }))!.onHand as number;
  await page.goto("/admin/inventory?sheet=1#stock-sheet");
  const panel = page.locator("#stock-sheet");
  await expect(panel.getByRole("link", { name: "Download the stock sheet" })).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles({
    name: "stock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`sku,count,change,reason\r\nLOAD-MORE-1,,4,\r\nNO-SUCH-SKU,3,,\r\n`),
  });
  await expect(panel.getByText("stock.csv")).toBeVisible();
  await panel.getByLabel(/^Reason/).fill("Shelf count, e2e");
  await panel.getByRole("button", { name: "Check the sheet" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "change now" })).toContainText("1 change now");
  await expect(panel.getByRole("row", { name: /LOAD-MORE-1/ })).toContainText("Changes now");
  await expect(panel.getByRole("row", { name: /NO-SUCH-SKU/ })).toContainText("No pack has this SKU.");
  await shot(page, "stock-sheet-check");
  await panel.getByRole("button", { name: "Apply 1 change" }).click();
  await panel.getByRole("group", { name: "Apply the sheet?" }).getByRole("button", { name: "Yes, apply 1" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "updated" })).toContainText("1 pack updated, 1 not changed.");
  expect((await InventoryItem.findOne({ variantId: pack._id }))!.onHand).toBe(before + 4);
  await page.context().close();
});
