// Providers at desktop and phone width: staff list a product with a new provider, the owner
// approves the provider and then the product, and shoppers see "Provided by" on the card, the
// product page (photo first on phones), the basket, the order page; the packing slip groups by shop.
import { test, expect, type Browser, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { CartLine, Order } from "../../src/lib/commerce/models";
import { ApprovalRequest } from "../../src/lib/governance/models";
import { Provider } from "../../src/lib/providers/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Provider Owner", email: "provider-owner@e2e.test", phone: "9000000411" };
const STAFF = { name: "Provider Staff", email: "provider-staff@e2e.test", phone: "9000000412" };
const SHOPPER = { name: "Provider Shopper", email: "provider-shopper@e2e.test", phone: "9000000413" };
const out = process.env.SHOT_DIR;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create([
    { ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash },
    { ...STAFF, roles: ["customer", "admin"], emailVerified: true, passwordHash },
    { ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash },
  ]);
  await Category.create({ slug: "gifts", name: { en: "Gifts", mr: "भेटवस्तू" } });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, page: Page, who: { email: string }) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
    isMobile: test.info().project.name === "mobile",
  });
  const tab = await context.newPage();
  await tab.goto("/login");
  await tab.getByRole("button", { name: "Email", exact: true }).click();
  await tab.getByLabel("Email address").fill(who.email);
  await tab.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await tab.getByRole("button", { name: "Sign in with email" }).click();
  await tab.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return tab;
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_providers-${name}.png`, fullPage: true });
}

test("staff list a product with a new provider; it goes live once the owner approves both", async ({ browser, page }) => {
  const staff = await signedIn(browser, page, STAFF);
  await staff.goto("/admin/products/new");
  const form = staff.locator("main");
  await form.getByLabel("Name", { exact: true }).fill("Kale Hamper");
  await form.getByLabel("Description", { exact: true }).fill("A gift hamper from Kale Toys");
  await form.getByLabel(/^Provided by/).selectOption({ label: "+ Add a new provider…" });
  await form.getByLabel("Shop name").fill("Kale Toys");
  await form.getByLabel("Town").fill("Pali");
  await form.getByLabel(/^Web address/).fill("kale-hamper");
  await form.getByLabel(/^Pack label/).fill("1 box");
  await form.getByLabel("Pack quantity").fill("1");
  await form.getByLabel("Selling price (₹)").fill("449");
  await form.getByLabel(/^MRP/).fill("499");
  await form.getByLabel("Opening stock").fill("10");
  // staff are never asked what the shop paid
  await expect(form.getByLabel(/^Purchase price/)).toHaveCount(0);
  await shot(staff, "add-product");
  await form.getByRole("button", { name: "Send for approval" }).click();
  await expect(form.getByText("Request sent. The product goes live once an owner approves it.")).toBeVisible({ timeout: 30_000 });
  const provider = await Provider.findOne({ name: "Kale Toys" });
  expect(provider.status).toBe("pending");

  // the owner can't put the item live while its provider waits
  const owner = await signedIn(browser, page, OWNER);
  const request = await ApprovalRequest.findOne({ kind: "product", state: "pending" });
  const review = async (change?: () => Promise<void>) => {
    await owner.goto(`/super-admin/approvals?review=${request._id}#review`);
    await expect(owner.locator("#review")).toContainText("Kale Toys, Pali");
    await change?.();
    await owner.locator("#review").getByRole("button", { name: "Record decision" }).click();
    await owner.getByRole("button", { name: /^Yes, / }).click();
  };
  await review();
  await expect(owner.locator("#review").getByText("Approve the provider Kale Toys first")).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByText(/1\s+new provider to approve/)).toBeVisible();

  await owner.goto("/admin/providers?status=pending");
  await owner.getByRole("link", { name: "Kale Toys" }).click();
  const panel = owner.locator("#provider");
  await expect(panel).toContainText("Waiting for owner");
  await shot(owner, "approve-provider");
  await panel.getByRole("button", { name: "Approve" }).click();
  // the decision buttons give way to its new status
  await expect(panel.locator(".eyebrow")).toContainText("Live", { timeout: 30_000 });
  await expect(panel.getByRole("button", { name: "Approve" })).toHaveCount(0);
  // the owner corrects the count and adds what the shop paid before approving
  await review(async () => {
    const form = owner.locator("#review");
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Kale Hamper");
    await form.getByLabel("Opening stock").fill("12");
    await form.getByLabel(/^Purchase price/).fill("300");
    await shot(owner, "review-edit");
  });
  // approved, the request leaves the waiting list and the product is live with its provider
  await expect.poll(async () => String((await Product.findOne({ slug: "kale-hamper" }))?.providerId), { timeout: 30_000 }).toBe(
    String(provider._id),
  );
  const pack = await ProductVariant.findOne({ sku: "kale-hamper-1" }).select("+costPaise");
  expect([pack.pricePaise, pack.costPaise]).toEqual([44900, 30000]);
  expect((await InventoryItem.findOne({ variantId: pack._id })).onHand).toBe(12);
});

test("shoppers see the provider on the card and in the product page's Product info", async ({ page }) => {
  await page.goto("/catalog");
  const card = page.locator("article.product-card", { hasText: "Kale Hamper" });
  await expect(card.locator(".provider-line")).toHaveText("Provided by Kale Toys, Pali");
  await card.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Kale Hamper" })).toBeVisible();
  const info = page.getByRole("region", { name: "Product info" });
  await expect(info.locator(".provider-row")).toContainText("Provided by");
  await expect(info.locator(".provider-row")).toContainText("Kale Toys, Pali");
  await expect(info).toContainText("Sold by");
  if (test.info().project.name === "mobile") {
    // the photo first, then the name; Product info isn't left under the pinned buy bar
    const photo = (await page.locator(".product-gallery").boundingBox())!;
    const name = (await page.locator("main h1").boundingBox())!;
    expect(photo.y).toBeLessThan(name.y);
    await info.locator(".provider-row").evaluate((row) => row.scrollIntoView({ block: "center" }));
    const bar = await page.locator(".variant-list").boundingBox();
    const row = (await info.locator(".provider-row").boundingBox())!;
    if (bar) expect(row.y + row.height <= bar.y || row.y >= bar.y + bar.height).toBe(true);
  }
  await shot(page, "product");
});

test("the basket and the order page name the provider, and the packing slip groups by shop", async ({ browser, page }) => {
  const shopper = await User.findOne({ email: SHOPPER.email });
  // made from its web address when the product was added
  const hamper = await ProductVariant.findOne({ sku: "kale-hamper-1" });
  await CartLine.create({ customerId: shopper._id, variantId: hamper._id, quantity: 1 });
  const order = await Order.create({
    customerId: shopper._id,
    number: `E2E-PROV-${test.info().project.name}`,
    idempotencyKey: `e2e-prov-${test.info().project.name}`,
    items: [
      { variantId: new mongoose.Types.ObjectId(), name: "Long notebook", label: "Pack of 1", quantity: 2, pricePaise: 6000, linePaise: 12000 },
      {
        variantId: hamper._id,
        name: "Kale Hamper",
        label: "1 box",
        quantity: 1,
        pricePaise: 44900,
        linePaise: 44900,
        providerId: (await Provider.findOne({ name: "Kale Toys" }))._id,
        providerName: "Kale Toys",
        providerTown: "Pali",
      },
    ],
    address: { name: "Provider Shopper", phone: SHOPPER.phone, line: "Fictional Test Street", pin: "999999", areaName: "Fictional area" },
    slotId: new mongoose.Types.ObjectId(),
    deliveryDate: "2099-01-01",
    deliveryWindow: "4–7 PM",
    paymentMethod: "cod",
    subtotalPaise: 56900,
    deliveryPaise: 0,
    totalPaise: 56900,
  });

  const customer = await signedIn(browser, page, SHOPPER);
  await customer.goto("/cart");
  await expect(customer.locator(".basket-line", { hasText: "Kale Hamper" }).locator(".provider-line")).toHaveText(
    "Provided by Kale Toys, Pali",
  );
  await customer.goto(`/account/orders/${order._id}`);
  const lines = customer.locator(".order-item");
  await expect(lines.filter({ hasText: "Kale Hamper" }).locator(".provider-line")).toHaveText("Provided by Kale Toys, Pali");
  await expect(lines.filter({ hasText: "Long notebook" }).locator(".provider-line")).toHaveCount(0);
  await shot(customer, "order");

  const staff = await signedIn(browser, page, STAFF);
  await staff.goto(`/admin/orders/${order._id}/slip`);
  const groups = staff.locator(".slip-group th");
  await expect(groups).toHaveText(["Our shelves", "From Kale Toys, Pali"]);
  await shot(staff, "slip");
});
