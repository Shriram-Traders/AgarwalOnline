// After a save, a form shows what was saved. React's own reset used to put a drop-down back to the
// choice the page first drew, so the colour theme showed the old one and the next Save wrote it
// back (owner's report, 2026-11-17). ActionForm now draws the fields afresh after each save.
import { test, expect, type Browser, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";
import { SystemSetting } from "../../src/lib/commerce/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Theme Owner", email: "theme-owner@e2e.test", phone: "9000000431" };

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await User.create({ ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, page: Page) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
    isMobile: test.info().project.name === "mobile",
    reducedMotion: "reduce",
  });
  const tab = await context.newPage();
  await tab.goto("/login");
  await tab.getByRole("button", { name: "Email", exact: true }).click();
  await tab.getByLabel("Email address").fill(OWNER.email);
  await tab.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await tab.getByRole("button", { name: "Sign in with email" }).click();
  await tab.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return tab;
}

test("a saved colour theme stays picked, through a second save and another change", async ({ browser, page }) => {
  await SystemSetting.deleteMany({ key: /^shop-/ });
  const owner = await signedIn(browser, page);
  await owner.goto("/super-admin#storefront");
  const front = owner.locator("#storefront");
  const theme = front.getByLabel("Colour theme");
  const save = front.getByRole("button", { name: "Save shop front" });
  const saved = () => SystemSetting.findOne({ key: "shop-storefront" }).lean<{ value: { theme: string; heroBadge?: string } }>();

  await theme.selectOption({ label: "School bus: navy header, amber buttons" });
  await save.click();
  await expect(front.getByText("Shop front saved.")).toBeVisible();
  // the box shows the theme just saved, not the one the page opened with
  await expect(theme).toHaveValue("bus");
  expect((await saved())?.value.theme).toBe("bus");

  // tapping Save again keeps it
  await save.click();
  await expect(save).toBeEnabled();
  await expect(theme).toHaveValue("bus");
  expect((await saved())?.value.theme).toBe("bus");

  // so does changing something else in the same form and saving that
  const announcement = front.getByRole("textbox", { name: /^Announcement For example/ });
  await announcement.fill("Closed on 1 November for Diwali");
  await save.click();
  await expect(save).toBeEnabled();
  await expect(theme).toHaveValue("bus");
  await expect(announcement).toHaveValue("Closed on 1 November for Diwali");
  expect((await saved())?.value.theme).toBe("bus");

  await SystemSetting.deleteMany({ key: /^shop-/ });
  await owner.context().close();
});
