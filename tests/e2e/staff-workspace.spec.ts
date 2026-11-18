import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { ChatConversation } from "../../src/lib/chat/models";

// The staff workspace: its own header, the settings search, the grouped menu with counts and the phone tabs.
const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Workspace Owner", phone: "9000000061", email: "ws-owner@e2e.test" };
const ADMIN = { name: "Workspace Admin", phone: "9000000062", email: "ws-admin@e2e.test" };
const SHOPPER = { name: "Workspace Shopper", phone: "9000000063", email: "ws-shopper@e2e.test" };
const phones = [OWNER.phone, ADMIN.phone, SHOPPER.phone];
const CHAT = "Workspace test: is my order on its way?";
const out = process.env.SHOT_DIR;

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await User.deleteMany({ phone: { $in: phones } });
  await ChatConversation.deleteMany({ title: CHAT });
  for (const name of ["ratelimits", "authRateLimits"]) await mongoose.connection.collection(name).deleteMany({});
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [, , shopper] = await User.create([
    { ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash },
    { ...ADMIN, roles: ["customer", "admin"], emailVerified: true, passwordHash },
    { ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash },
  ]);
  await ChatConversation.create({ customerId: shopper._id, title: CHAT, status: "waiting-support" });
  // a product to find: its words are in no setting, page or other test's product
  await removeSearchProduct();
  const shelf = await Category.findOneAndUpdate(
    { slug: "ws-search-shelf" },
    { $setOnInsert: { name: { en: "Workspace Shelf", mr: "Workspace Shelf" } } },
    { upsert: true, new: true },
  );
  const product = await Product.create({
    slug: "ws-zebrafish-sharpener",
    name: { en: "Zebrafish Sharpener", mr: "Zebrafish Sharpener" },
    description: { en: "A sharpener", mr: "A sharpener" },
    categoryId: shelf._id,
    categorySlug: "ws-search-shelf",
    status: "published",
  });
  const pack = await ProductVariant.create({ productId: product._id, sku: "WS-ZEBRA-1", label: "1 piece", unit: "piece", packQuantity: 1, pricePaise: 2000, mrpPaise: 2000 });
  await InventoryItem.create({ variantId: pack._id, onHand: 3, reserved: 0 });
});
async function removeSearchProduct() {
  const product = await Product.findOne({ slug: "ws-zebrafish-sharpener" });
  if (!product) return;
  const packs = await ProductVariant.find({ productId: product._id });
  await InventoryItem.deleteMany({ variantId: { $in: packs.map((pack) => pack._id) } });
  await ProductVariant.deleteMany({ productId: product._id });
  await Product.deleteOne({ _id: product._id });
}
test.afterAll(async () => {
  await removeSearchProduct();
  await Category.deleteOne({ slug: "ws-search-shelf" });
  await ChatConversation.deleteMany({ title: CHAT });
  await User.deleteMany({ phone: { $in: phones } });
  await mongoose.disconnect();
});

async function signIn(page: Page, who: { email: string }) {
  // the shop allows 5 email sign-ins per account in 15 minutes; this file signs the owner in more often
  for (const name of ["ratelimits", "authRateLimits"]) await mongoose.connection.collection(name).deleteMany({});
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/admin");
}
const finder = (page: Page) => page.getByRole("combobox", { name: "Search the workspace" });

test("a staff list answers as you type, with no button to press, and Clear empties the box", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/admin/products");
  const filters = page.getByRole("search", { name: "Filter products" });
  await expect(filters.getByRole("button", { name: "Show products" })).toBeHidden();
  await filters.getByRole("textbox", { name: /^Search/ }).fill("zebrafish");
  await expect(page).toHaveURL(/\/admin\/products\?q=zebrafish$/);
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table")).toContainText("Zebrafish Sharpener");
  // the shelf's name finds it too, and picking a category applies at once
  await filters.getByRole("textbox", { name: /^Search/ }).fill("workspace shelf");
  await expect(page.locator(".data-table")).toContainText("Zebrafish Sharpener");
  await filters.getByRole("combobox", { name: "Category" }).selectOption("ws-search-shelf");
  await expect(page).toHaveURL(/category=ws-search-shelf/);
  await filters.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL("/admin/products");
  await expect(filters.getByRole("textbox", { name: /^Search/ })).toHaveValue("");
});

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "the phone has its own tests below");

  test("the staff header replaces the shop's, and the search finds settings", async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.locator(".top-strip")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Basket" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Search products" })).toHaveCount(0);
    // the header's; the one-line staff footer links back to the shop too
    await expect(page.getByRole("banner").getByRole("link", { name: "View shop" })).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(finder(page)).toBeFocused();
    await finder(page).fill("free delivery");
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("option").first()).toContainText("Free delivery from");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/super-admin#delivery-rules");
    await expect(page.locator("#delivery-rules")).toBeFocused();
    await expect(page.locator("#delivery-rules")).toHaveClass(/is-targeted/);

    await finder(page).fill("AGS-20261003");
    await expect(page.getByRole("option").first()).toContainText("Orders matching");
    await page.keyboard.press("Escape");
    await expect(finder(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("the search finds real products as you type, and a chip narrows it to them", async ({ page }) => {
    await signIn(page, OWNER);
    await finder(page).fill("zebrafish");
    const option = page.getByRole("option", { name: /Zebrafish Sharpener/ });
    await expect(option).toBeVisible();
    const chips = page.getByRole("group", { name: "Search the workspace" });
    await chips.getByRole("button", { name: /^Products/ }).click();
    await expect(chips.getByRole("button", { name: /^Products/ })).toHaveAttribute("aria-pressed", "true");
    await expect(finder(page)).toBeFocused();
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/products\/[a-f\d]{24}$/);
  });

  test("the menu folds, remembers it, and counts what waits", async ({ page }) => {
    await signIn(page, OWNER);
    const menu = page.getByRole("navigation", { name: "Staff workspace" });
    await expect(menu.getByRole("link", { name: /Support chats \(\d+ waiting\)/ })).toBeVisible();
    const setup = menu.getByRole("button", { name: /^Setup/ });
    await expect(setup).toHaveAttribute("aria-expanded", "false");
    await setup.click();
    await expect(menu.getByRole("link", { name: "Staff & roles" })).toBeVisible();
    await page.reload();
    await expect(menu.getByRole("button", { name: /^Setup/ })).toHaveAttribute("aria-expanded", "true");
  });

  test("an admin only finds what they may open", async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page.getByRole("navigation", { name: "Staff workspace" }).getByRole("button", { name: /^Setup/ })).toHaveCount(0);
    // the shop's own GSTIN and tax details are the owner's; a provider's GSTIN is on Providers, which admins may open
    await finder(page).fill("gstin");
    await expect(page.getByRole("option").first()).toContainText("Providers");
    await expect(page.getByRole("option").filter({ hasText: "Business name on bills" })).toHaveCount(0);
    const counts = await page.evaluate(() => fetch("/api/staff/counts").then((response) => response.json()));
    expect(counts.counts).not.toHaveProperty("approvals");
    expect(counts.counts.chats).toBeGreaterThanOrEqual(1);
  });

  test("the counts are for staff only", async ({ request }) => {
    expect((await request.get("/api/staff/counts")).status()).toBe(401);
  });

  test("the account menu has no language switch", async ({ page }) => {
    await signIn(page, OWNER);
    await page.locator(".staff-header .account-menu summary").click();
    await expect(page.locator(".staff-header .account-menu").getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "मराठी" })).toHaveCount(0);
  });

  test("overview and settings pass the automated accessibility check", async ({ page }) => {
    await signIn(page, OWNER);
    for (const path of ["/admin", "/super-admin"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), path).toEqual([]);
    }
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "desktop is covered above");

  test("staff get their own tabs, a search sheet and a More sheet", async ({ page }) => {
    await signIn(page, OWNER);
    const tabs = page.getByRole("navigation", { name: "Workspace tabs" });
    await expect(tabs).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);

    await tabs.getByRole("button", { name: "Search" }).click();
    const sheet = page.getByRole("dialog", { name: "Search the workspace" });
    await expect(sheet.getByRole("combobox", { name: "Search the workspace" })).toBeFocused();
    await sheet.getByRole("combobox").fill("delivery fee");
    await sheet.getByRole("option", { name: /Delivery fee/ }).click();
    await expect(page).toHaveURL("/super-admin#areas");
    await expect(sheet).toHaveCount(0);

    await tabs.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog", { name: "Workspace menu" });
    // the shop and the everyday jobs come first, then every page as a tile: nothing to unfold
    await expect(more.getByRole("link").first()).toHaveAccessibleName("View shop");
    await expect(more.getByRole("link", { name: "Add product" })).toBeVisible();
    await expect(more.getByRole("link", { name: /^Support chats/ })).toBeVisible();
    if (out) await page.screenshot({ path: `${out}/mobile_staff-more-sheet.png` });
    await more.getByRole("link", { name: "Staff & roles" }).click();
    await expect(page).toHaveURL("/super-admin/staff");
    await expect(more).toHaveCount(0);
  });

  test("settings are a list that opens one section at a time", async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto("/super-admin");
    const list = page.getByRole("navigation", { name: "Settings sections" });
    if (out) await page.screenshot({ path: `${out}/mobile_settings-list.png` });
    await list.getByRole("link", { name: /^Business and tax/ }).click();
    await expect(page).toHaveURL("/super-admin#tax");
    await expect(page.getByLabel(/^GSTIN/)).toBeVisible();
    // the list and every other section step aside
    await expect(list).toBeHidden();
    await expect(page.locator("#areas")).toBeHidden();
    if (out) await page.screenshot({ path: `${out}/mobile_settings-section.png` });
    await page.getByRole("link", { name: "All settings" }).click();
    await expect(list).toBeVisible();
    await expect(page.getByLabel(/^GSTIN/)).toBeHidden();
    // the phone's Back button closes the section too
    await list.getByRole("link", { name: /^Service areas/ }).click();
    await expect(page.getByRole("heading", { name: "Service areas" })).toBeVisible();
    await page.goBack();
    await expect(list).toBeVisible();
  });

  test("the shop's name and the header icons never meet, on any phone", async ({ page }) => {
    await signIn(page, OWNER);
    // a page with the Back button: the overview has none, and more room
    await page.goto("/admin/products");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("button", { name: "Back" })).toBeVisible();
    const icons = banner.locator(".staff-header-actions");
    for (const [width, textSize] of [
      [320, "100%"],
      [360, "100%"],
      [369, "100%"],
      [412, "100%"],
      [360, "200%"],
    ] as const) {
      await page.setViewportSize({ width, height: 740 });
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, textSize);
      // where the letters really end: they can run past the box the layout gives them
      const nameEnd = await banner.locator(".staff-brand").evaluate((element) => {
        const letters = document.createRange();
        letters.selectNodeContents(element);
        return letters.getBoundingClientRect().right;
      });
      const capsule = (await icons.boundingBox())!;
      expect(nameEnd, `${width}px at ${textSize} text`).toBeLessThanOrEqual(capsule.x);
      expect(capsule.x + capsule.width).toBeLessThanOrEqual(width);
      await expect(banner.getByRole("link", { name: "View shop" })).toBeInViewport();
      await expect(banner.getByRole("button", { name: "New-order sound" })).toBeInViewport();
      await expect(banner.locator(".alerts-bell")).toBeInViewport();
      if (out) {
        await page.screenshot({
          path: `${out}/mobile_staff-header-${width}-${textSize.replace("%", "")}.png`,
          clip: { x: 0, y: 0, width, height: 240 },
        });
      }
    }
    // the overview has no Back button: the name lines up with the page instead
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.goto("/admin");
    await expect(banner.getByRole("button", { name: "Back" })).toHaveCount(0);
    const name = (await banner.locator(".staff-brand").boundingBox())!;
    const heading = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(Math.abs(name.x - heading.x)).toBeLessThanOrEqual(1);
    if (out) await page.screenshot({ path: `${out}/mobile_staff-header-overview.png`, clip: { x: 0, y: 0, width: 412, height: 240 } });
  });
});
