import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const CUSTOMER = { phone: "9000000031", email: "auth-customer@e2e.test", name: "Auth Customer" };
const STAFF = { phone: "9000000032", email: "auth-admin@e2e.test", name: "Auth Admin" };
const PAUSED = { phone: "9000000033", name: "Paused Person" };
const PASSWORD = "Local-test-password-123";
const OTP = "246810";
const phones = [CUSTOMER.phone, STAFF.phone, PAUSED.phone];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await User.deleteMany({ phone: { $in: phones } });
  // OTP sends are limited per phone per 15 minutes; earlier runs must not eat this run's budget
  for (const name of ["ratelimits", "authRateLimits"])
    await mongoose.connection.collection(name).deleteMany({});
  await User.create([
    { ...STAFF, roles: ["customer", "admin"], passwordHash: await bcrypt.hash(PASSWORD, 12) },
    { ...PAUSED, roles: ["customer"], active: false },
  ]);
});
test.afterAll(async () => {
  await User.deleteMany({ phone: { $in: phones } });
  await mongoose.disconnect();
});

async function signOut(page: Page) {
  await page.goto("/account");
  await page.locator("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
}
async function menu(page: Page) {
  const details = page.locator(".account-menu");
  if (!(await details.isVisible())) return null; // phones use the bottom nav instead
  await details.locator("summary").click();
  return details;
}

test("signs up by OTP with a password and lands on the account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByRole("button", { name: "Start account creation" }).click();
  await page.getByLabel("Your name").fill(CUSTOMER.name);
  await page.getByLabel("Create password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/");
  // customers land in the shop after signing in; the account page is one tap away
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: `Hello, ${CUSTOMER.name}` })).toBeVisible();
  const opened = await menu(page);
  if (opened) {
    await expect(opened.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    await expect(opened.getByText("Store workspace")).toHaveCount(0);
    await opened.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
  } else await signOut(page);
  const stored = await User.findOne({ phone: CUSTOMER.phone });
  expect(stored?.roles).toEqual(["customer"]);
});

test("mobile number and password: rejects a wrong password, accepts the right one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("Invalid mobile number or password.");
  // the number typed before the failed attempt is still there
  await expect(page.getByLabel("Mobile number")).toHaveValue(CUSTOMER.phone);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
  await signOut(page);
});

test("email and password signs a customer in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  await signOut(page);
});

test("OTP signs an existing customer in, and refuses a paused account", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Use OTP/ }).click();
  await page.getByLabel("Mobile number").fill(PAUSED.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await expect(page.locator(".error-message")).toContainText("not active");
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/");
  await signOut(page);
});

test("staff sign in on the same page, land in their workspace and can switch from the menu", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/admin");
  await page.goto("/");
  const opened = await menu(page);
  if (opened) {
    await expect(opened.getByText("Store workspace")).toBeVisible();
    await opened.getByRole("link", { name: "Operations" }).click();
    await expect(page).toHaveURL("/admin");
  } else {
    await page.goto("/account");
    await page.getByRole("link", { name: /Open your workspace/ }).click();
    await expect(page).toHaveURL("/admin");
  }
  await page.goto("/super-admin/staff");
  await expect(page).toHaveURL("/forbidden");
  await signOut(page);
});

test("staff can also sign in by OTP, and /staff/login now redirects", async ({ page }) => {
  await page.goto("/staff/login");
  await expect(page).toHaveURL("/login");
  await page.getByRole("button", { name: /Use OTP/ }).click();
  await page.getByLabel("Mobile number").fill(STAFF.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/admin");
  // staff keep the ordinary 7-day session: a sign-in from 13 hours ago still opens the workspace
  const staffId = (await User.findOne({ phone: STAFF.phone }))!._id;
  await mongoose.connection
    .collection("authSessions")
    .updateMany({ userId: staffId }, { $set: { createdAt: new Date(Date.now() - 13 * 3600000) } });
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin");
});

/** Stops the browser at Google and reports the address it was sent to. */
async function googleRedirect(page: Page, click: () => Promise<void>) {
  let seen: URL | null = null;
  await page.route("https://accounts.google.com/**", async (route) => {
    seen = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<p>Google stub</p>" });
  });
  await click();
  await expect.poll(() => seen?.href ?? "", { timeout: 15000 }).toContain("accounts.google.com");
  await page.unroute("https://accounts.google.com/**");
  return seen as unknown as URL;
}

test("Continue with Google sends people to Google with this site's callback", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    const google = await googleRedirect(page, () =>
      page.getByRole("button", { name: "Continue with Google" }).click(),
    );
    expect(google.searchParams.get("client_id")).toBe("e2e-google-client.apps.googleusercontent.com");
    expect(google.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3002/api/auth/callback/google");
    expect(google.searchParams.get("prompt")).toBe("select_account");
    expect(google.searchParams.get("state")).toBeTruthy();
  }
});

test("Google errors come back as plain messages, and the landing route needs a session", async ({ page }) => {
  await page.goto("/login?error=account_not_linked");
  await expect(page.locator(".error-message").first()).toContainText("You already have an account with this email");
  await page.goto("/login?error=access_denied");
  await expect(page.locator(".error-message").first()).toContainText("Google sign-in was cancelled.");
  await page.goto("/auth/continue");
  // stays on the same host, so a session cookie would still apply
  await expect(page).toHaveURL("/login?error=signin_failed");
  await expect(page.locator(".error-message").first()).toContainText("Google sign-in didn’t complete");
});

test("a signed-in customer can connect Google from the account page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  // customers land in the shop after signing in; the account page is one tap away
  await page.goto("/account");
  const methods = page.getByRole("region", { name: "Sign-in methods" });
  await expect(methods).toContainText("Not connected.");
  const google = await googleRedirect(page, () =>
    methods.getByRole("button", { name: "Connect Google" }).click(),
  );
  expect(google.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3002/api/auth/callback/google");
  await signOut(page);
});

async function resetRateLimits() {
  for (const name of ["ratelimits", "authRateLimits"])
    await mongoose.connection.collection(name).deleteMany({});
}

test("same email back from Google: sign in once with a code, then connect Google", async ({ page }) => {
  await resetRateLimits();
  await page.goto("/login?error=account_not_linked");
  await expect(page.locator(".error-message").first()).toContainText("your orders are safe");
  // the form opens on the code step for the existing account
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/account?connect=google");
  const methods = page.getByRole("region", { name: "Sign-in methods" });
  await expect(methods).toContainText("One more step: connect Google");
  await expect(methods.getByRole("button", { name: "Connect Google" })).toBeVisible();
  await signOut(page);
});

test("a Google-only account folds into the customer's original account and shows its orders", async ({ page }) => {
  await resetRateLimits();
  const original = await User.findOne({ phone: CUSTOMER.phone });
  await mongoose.connection.collection("orders").insertOne({
    customerId: original!._id,
    number: "AGS-E2E-FOLD",
    totalPaise: 49900,
    orderStatus: "placed",
    createdAt: new Date(),
  });
  const ordersBefore = await mongoose.connection.collection("orders").countDocuments({ customerId: original!._id });
  // a first Google sign-in with a different Gmail made this phone-less account (a password is added only so the test can sign in)
  const googleOnly = await User.create({ name: "Gmail Person", email: "gmail-person@gmail.test", emailVerified: true, roles: ["customer"], passwordHash: await bcrypt.hash(PASSWORD, 12) });
  await mongoose.connection.collection("authAccounts").insertOne({ userId: googleOnly._id, providerId: "google", accountId: "e2e-google-sub", createdAt: new Date(), updatedAt: new Date() });

  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill("gmail-person@gmail.test");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  // customers land in the shop after signing in; the account page is one tap away
  await page.goto("/account");
  const claim = page.getByRole("region", { name: "Ordered with us before?" });
  await claim.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await claim.getByRole("button", { name: "Send code" }).click();
  await expect(claim).toContainText("We found an account with this number");
  await claim.getByLabel("Verification code").fill(OTP);
  await claim.getByRole("button", { name: "Verify" }).click();

  await expect(page).toHaveURL("/account?google=merged");
  await expect(page.getByText("Your Google sign-in now opens this account.")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Hello, ${CUSTOMER.name}` })).toBeVisible();
  expect(await User.exists({ _id: googleOnly._id })).toBeNull();
  expect(await mongoose.connection.collection("authAccounts").countDocuments({ userId: original!._id, providerId: "google" })).toBe(1);
  expect(await mongoose.connection.collection("orders").countDocuments({ customerId: original!._id })).toBe(ordersBefore);
  await mongoose.connection.collection("orders").deleteOne({ number: "AGS-E2E-FOLD" });
  await mongoose.connection.collection("authAccounts").deleteMany({ accountId: "e2e-google-sub" });
  await signOut(page);
});

test("the address form pre-fills the account number, and a Google-only account can verify its address number to sign in", async ({ page }) => {
  await resetRateLimits();
  const { ServiceArea } = await import("../../src/lib/db/models");
  const area = await ServiceArea.findOneAndUpdate(
    { key: "e2e-auth-area" },
    { $set: { name: "E2E Auth Area", pincodes: ["402106"], enabled: true, feePaise: 0 } },
    { upsert: true, new: true },
  );
  // a customer with a sign-in number sees it pre-filled, and no extra box
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/account/addresses");
  await expect(page.getByLabel("Mobile number")).toHaveValue(CUSTOMER.phone);
  await expect(page.getByText("Also use this number to sign in")).toHaveCount(0);
  await signOut(page);

  // a Google-only account: empty number, and the box to make it a sign-in number
  const NEW_NUMBER = "9000000039";
  await User.deleteMany({ phone: NEW_NUMBER });
  const googleOnly = await User.create({ name: "Gmail Shopper", email: "gmail-shopper@gmail.test", emailVerified: true, roles: ["customer"], passwordHash: await bcrypt.hash(PASSWORD, 12) });
  await mongoose.connection.collection("authAccounts").insertOne({ userId: googleOnly._id, providerId: "google", accountId: "e2e-google-shopper", createdAt: new Date(), updatedAt: new Date() });
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill("gmail-shopper@gmail.test");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/account/addresses");
  await expect(page.getByLabel("Mobile number")).toHaveValue("");
  await page.getByLabel("Recipient name").fill("Gmail Shopper");
  await page.getByLabel("Mobile number").fill(NEW_NUMBER);
  await page.getByLabel("Also use this number to sign in").check();
  await page.getByLabel("House, building, street").fill("12 Market Road, Nagothane");
  await page.getByLabel("Service area").selectOption(String(area!._id));
  await page.getByLabel("PIN code").fill("402106");
  await page.getByRole("button", { name: "Save address" }).click();

  await expect(page).toHaveURL("/account/addresses?verify=1");
  const verifyBox = page.getByRole("region", { name: "Verify this number to sign in with it" });
  await expect(verifyBox).toContainText("This number will be added to your account.");
  await verifyBox.getByLabel("Verification code").fill(OTP);
  await verifyBox.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL("/account?phone=added");
  await expect(page.getByText("Mobile number added.")).toBeVisible();
  const saved = await User.findById(googleOnly._id);
  expect(saved?.phone).toBe(NEW_NUMBER);
  expect(await mongoose.connection.collection("addresses").countDocuments({ customerId: googleOnly._id, phone: NEW_NUMBER })).toBe(1);

  await signOut(page);
  await mongoose.connection.collection("addresses").deleteMany({ customerId: googleOnly._id });
  await mongoose.connection.collection("authAccounts").deleteMany({ accountId: "e2e-google-shopper" });
  await User.deleteOne({ _id: googleOnly._id });
  await ServiceArea.deleteOne({ key: "e2e-auth-area" });
});

test("the account page shows whether the email is confirmed and sends a confirmation link", async ({ page }) => {
  await resetRateLimits();
  await User.updateOne({ phone: CUSTOMER.phone }, { $set: { emailVerified: false } });
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/");
  // customers land in the shop after signing in; the account page is one tap away
  await page.goto("/account");
  const methods = page.getByRole("region", { name: "Sign-in methods" });
  await expect(methods).toContainText(`${CUSTOMER.email} · Not confirmed yet`);
  await methods.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(methods).toContainText(`We sent a confirmation link to ${CUSTOMER.email}`);
  // what the confirmation link lands on
  await page.goto("/auth/email-verified");
  await expect(page).toHaveURL("/account?email=verified");
  await expect(page.getByText("Email confirmed.")).toBeVisible();
  await page.goto("/auth/email-verified?error=TOKEN_EXPIRED");
  await expect(page.getByText("That link has expired. Send a new one below.")).toBeVisible();
  await signOut(page);
  await page.goto("/auth/email-verified?error=INVALID_TOKEN");
  await expect(page).toHaveURL(/\/login\?email=INVALID_TOKEN/);
  await expect(page.getByText("That confirmation link didn’t work or has expired.")).toBeVisible();
});

