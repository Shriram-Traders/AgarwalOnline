import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";
import { ChatConversation } from "../../src/lib/chat/models";

// The staff workspace: its own header, the settings search, the grouped menu with counts and the phone tabs.
const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Workspace Owner", phone: "9000000061", email: "ws-owner@e2e.test" };
const ADMIN = { name: "Workspace Admin", phone: "9000000062", email: "ws-admin@e2e.test" };
const SHOPPER = { name: "Workspace Shopper", phone: "9000000063", email: "ws-shopper@e2e.test" };
const phones = [OWNER.phone, ADMIN.phone, SHOPPER.phone];
const CHAT = "Workspace test: is my order on its way?";

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
});
test.afterAll(async () => {
  await ChatConversation.deleteMany({ title: CHAT });
  await User.deleteMany({ phone: { $in: phones } });
  await mongoose.disconnect();
});

async function signIn(page: Page, who: { email: string }) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/admin");
}
const finder = (page: Page) => page.getByRole("combobox", { name: "Search the workspace" });

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "the phone has its own tests below");

  test("the staff header replaces the shop's, and the search finds settings", async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.locator(".top-strip")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Basket" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Search products" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View shop" })).toBeVisible();

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
    await finder(page).fill("gstin");
    await expect(page.getByText("No setting or page called “gstin”")).toBeVisible();
    const counts = await page.evaluate(() => fetch("/api/staff/counts").then((response) => response.json()));
    expect(counts.counts).not.toHaveProperty("approvals");
    expect(counts.counts.chats).toBeGreaterThanOrEqual(1);
  });

  test("the counts are for staff only", async ({ request }) => {
    expect((await request.get("/api/staff/counts")).status()).toBe(401);
  });

  test("works in Marathi", async ({ page }) => {
    await signIn(page, OWNER);
    await page.locator(".staff-header .account-menu summary").click();
    await page.getByRole("banner").getByRole("button", { name: "मराठी" }).click();
    const menu = page.getByRole("navigation", { name: "दुकानाच्या कामाचा मेनू" });
    await expect(menu.getByRole("link", { name: "आढावा व ऑर्डर" })).toBeVisible();
    await page.getByRole("combobox", { name: "कामात शोधा" }).fill("मोफत");
    await expect(page.getByRole("option", { name: /मोफत वितरण/ })).toBeVisible();
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
    await more.getByRole("link", { name: "Staff & roles" }).click();
    await expect(page).toHaveURL("/super-admin/staff");
    await expect(more).toHaveCount(0);
  });
});
