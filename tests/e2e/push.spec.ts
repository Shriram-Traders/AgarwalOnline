// The "Notifications on this device" card, at desktop and phone width: a customer who has
// allowed notifications gets a Turn on button; where the site is blocked, the card says how to
// unblock it; staff who manage orders are told about new orders. Nothing is ever subscribed or sent.
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const PEOPLE = {
  customer: { name: "Push Customer", email: "push-customer@e2e.test", phone: "9000000131", roles: ["customer"] },
  admin: { name: "Push Staff", email: "push-staff@e2e.test", phone: "9000000132", roles: ["customer", "admin"] },
};
type Who = keyof typeof PEOPLE;
const out = process.env.SHOT_DIR;

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create(Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })));
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, info: TestInfo, who: Who, allowed: boolean) {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    userAgent,
    deviceScaleFactor,
    permissions: allowed ? ["notifications"] : [],
  });
  const page = await context.newPage();
  // the headless test browser answers "denied" even after the grant above; a real one says granted
  if (allowed)
    await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "granted" }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

test("a customer can turn notifications on from Notifications and Account", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "customer", true);
  await page.goto("/account/notifications");
  const card = page.locator("main #push");
  await expect(card.getByRole("heading", { name: "Notifications on this device" })).toBeVisible();
  await expect(card.getByText("Get order, delivery and payment updates on this phone or computer")).toBeVisible();
  await expect(card.getByRole("button", { name: "Turn on notifications" })).toBeEnabled();
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_push-card.png`, fullPage: false });
  await page.goto("/account");
  await expect(page.locator("main").getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  await page.context().close();
});

test("a blocked site says how to allow notifications again", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "customer", false);
  await page.evaluate(() => Notification.permission).then((permission) => test.skip(permission !== "denied", "this browser asks instead"));
  await page.goto("/account/notifications");
  await expect(page.locator("main #push").getByText("Notifications are blocked for this site.")).toBeVisible();
  await expect(page.locator("main #push").getByRole("button")).toHaveCount(0);
  await page.context().close();
});

test("staff who manage orders are told the card brings new orders", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "admin", true);
  await page.goto("/account/notifications");
  await expect(page.locator("main #push").getByText("Get new orders and updates on this phone or computer")).toBeVisible();
  await page.context().close();
});
