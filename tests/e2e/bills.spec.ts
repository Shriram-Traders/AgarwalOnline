// Bills at desktop and phone width: an order with Agarwal's items and a provider's that bills in its own
// name shows one bill per seller, each with Print bill and Share PDF on WhatsApp, on the order page, in
// the order history, the family's spend list, on the staff order page and the packing slip. Share hands the phone's share list a
// real PDF (stubbed here), or on a computer saves the PDF and opens WhatsApp Web with the view-only link,
// which works signed out. A PDF that can't be made says why, and Share sends that link instead (so does a PDF
// too slow for a phone's share list); a phone browser
// that can't share files saves the PDF and offers Open WhatsApp. An admin's change to a provider's tax
// details waits for the owner.
import { test, expect, type Browser, type Page } from "@playwright/test";

const ORIGIN = process.env.E2E_ORIGIN ?? "http://127.0.0.1:3002";
// what WhatsApp gets with a bill's view-only link
const LINK_TEXT = new RegExp(`^Bill for order AGS-20261107-00031\\. ${ORIGIN.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/b/[A-Za-z0-9_-]{24}$`);
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";
import { Order, SystemSetting } from "../../src/lib/commerce/models";
import { ApprovalRequest } from "../../src/lib/governance/models";
import { Provider } from "../../src/lib/providers/models";
import { OrderFeedback } from "../../src/lib/feedback/models";
import { Family } from "../../src/lib/family/models";
import { gstinCheckChar } from "../../src/lib/tax/gst";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Bills Owner", email: "bills-owner@e2e.test", phone: "9000000511" };
const ADMIN = { name: "Bills Admin", email: "bills-admin@e2e.test", phone: "9000000512" };
const SHOPPER = { name: "Bills Shopper", email: "bills-shopper@e2e.test", phone: "9000000513" };
const OTHER = { name: "Another Shopper", email: "bills-other@e2e.test", phone: "9000000514" };
const RELATIVE = { name: "Bills Relative", email: "bills-relative@e2e.test", phone: "9000000515" };
const gstin = (first14: string) => first14 + gstinCheckChar(first14);
const SHOP_GSTIN = gstin("27AAAAA0000A1Z");
const KALE_GSTIN = gstin("27ABCDE1234F1Z");
const out = process.env.SHOT_DIR;
let orderId = "";
let kaleId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [owner, , shopper, , relative] = await User.create([
    { ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash },
    { ...ADMIN, roles: ["customer", "admin"], emailVerified: true, passwordHash },
    { ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash },
    { ...OTHER, roles: ["customer"], emailVerified: true, passwordHash },
    { ...RELATIVE, roles: ["customer"], emailVerified: true, passwordHash },
  ]);
  // the shopper's family: a relative sees the order in Family spend, but can't open its order page
  const family = await Family.create({ name: "Shopper family", ownerId: shopper._id, adults: [shopper._id, relative._id], inviteToken: "bills-family-invite-0001" });
  await SystemSetting.create([
    { key: "tax-details", value: { legalName: "Agarwal General Stores", gstin: SHOP_GSTIN, address: "Main Road, Nagothane", stateCode: "27" } },
    { key: "provider-billing", value: { confirmedAt: new Date(), confirmedBy: String(owner._id) } },
  ]);
  const kale = await Provider.create({
    name: "Kale Toys",
    town: "Pali",
    slug: "kale-toys-pali",
    status: "active",
    createdBy: owner._id,
    billing: {
      ownBills: true,
      legalName: "Kale Toys and Games",
      registration: "composition",
      gstin: KALE_GSTIN,
      address: "Shop 4, Station Road, Pali 410205",
      stateCode: "27",
      prefix: "KT",
      style: "ledger",
      agreementAt: new Date(),
      agreementBy: owner._id,
    },
  });
  kaleId = String(kale._id);
  await Provider.create({ name: "Patil Crafts", town: "Roha", slug: "patil-crafts-roha", status: "active", createdBy: owner._id });
  const order = await Order.create({
    customerId: shopper._id,
    number: "AGS-20261107-00031",
    idempotencyKey: "e2e-bills-1",
    familyId: family._id,
    items: [
      { variantId: new mongoose.Types.ObjectId(), name: "Long notebook", label: "Pack of 1", quantity: 1, pricePaise: 10000, linePaise: 10000 },
      {
        variantId: new mongoose.Types.ObjectId(),
        name: "Toy car",
        label: "1 piece",
        quantity: 1,
        pricePaise: 30000,
        linePaise: 30000,
        providerId: kale._id,
        providerName: "Kale Toys",
        providerTown: "Pali",
        billedBy: kale._id,
      },
    ],
    address: { name: "Bills Shopper", phone: SHOPPER.phone, line: "Fictional Test Street", pin: "999999", areaName: "Fictional area" },
    slotId: new mongoose.Types.ObjectId(),
    deliveryDate: "2026-11-07",
    deliveryWindow: "4–7 PM",
    paymentMethod: "cod",
    paymentStatus: "paid",
    orderStatus: "completed",
    deliveryStatus: "delivered",
    subtotalPaise: 40000,
    promotionDiscountPaise: 4000,
    deliveryPaise: 3000,
    totalPaise: 39000,
    bill: { issuedAt: new Date(), seller: { legalName: "Agarwal General Stores", address: "Main Road, Nagothane", gstin: SHOP_GSTIN } },
    providerBills: [
      {
        providerId: kale._id,
        number: "KT/26-27/0001",
        issuedAt: new Date(),
        seller: { legalName: "Kale Toys and Games", address: "Shop 4, Station Road, Pali 410205", gstin: KALE_GSTIN, stateCode: "27", registration: "composition", style: "ledger" },
      },
    ],
  });
  orderId = String(order._id);
  // the "How did we do?" popup stays out of the way
  await OrderFeedback.create({ orderId: order._id, orderNumber: order.number, state: "skipped" });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const mobile = () => test.info().project.name === "mobile";

async function signedIn(browser: Browser, page: Page, who: { email: string }) {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: page.viewportSize()!,
    isMobile: mobile(),
    hasTouch: mobile(),
    acceptDownloads: true,
    reducedMotion: "reduce",
  });
  // WhatsApp Web is never really opened
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/plain", body: "WhatsApp" }));
  // a phone's share list, stubbed: it records the files it was handed
  await context.addInitScript(() => {
    const shared: { name: string; type: string; size: number; head: string }[][] = [];
    // what went to the share list as words alone: the bill's link, when there was no PDF to hand over
    const sharedText: string[] = [];
    Object.assign(window, { __shared: shared, __sharedText: sharedText });
    Object.defineProperty(navigator, "canShare", { value: (data: { files?: File[] }) => Boolean(data?.files?.length), configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files?: File[]; text?: string }) => {
        if (!data.files) return void sharedText.push(data.text ?? "");
        shared.push(
          await Promise.all(
            data.files.map(async (file) => ({ name: file.name, type: file.type, size: file.size, head: await file.slice(0, 5).text() })),
          ),
        );
      },
    });
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
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_bills-${name}.png`, fullPage: true });
}
/**
 * Print bill: on a computer the bill opens in a new tab, ready to print; on a phone it opens in place
 * (a second window there is a separate screen), with Back to come back.
 */
async function printFrom(page: Page, button: ReturnType<Page["getByRole"]>) {
  if (mobile()) {
    await button.click();
    await page.waitForURL(/\/api\/invoices\/.*print=1/);
    return page;
  }
  const [printed] = await Promise.all([page.context().waitForEvent("page"), button.click()]);
  await printed.waitForLoadState();
  return printed;
}
/** A download is a real PDF, named after its seller and bill. */
async function expectPdf(download: { suggestedFilename(): string; path(): Promise<string | null> }, name: RegExp) {
  expect(download.suggestedFilename()).toMatch(name);
  expect(readFileSync((await download.path())!).subarray(0, 5).toString()).toBe("%PDF-");
}

test("the order page gives each seller's bill its own row, with Print bill and Share PDF on WhatsApp", async ({ browser, page }) => {
  const customer = await signedIn(browser, page, SHOPPER);
  await customer.goto(`/account/orders/${orderId}`);
  const bills = customer.locator("#bills > li");
  await expect(bills).toHaveCount(2);
  const agarwal = bills.filter({ hasText: "Agarwal General Stores" });
  const kale = bills.filter({ hasText: "Kale Toys and Games" });
  // ₹100 of items less ₹10 of the coupon, plus ₹30 delivery; ₹300 less ₹30
  await expect(agarwal).toContainText("Bill 20261107-00031 · ₹120");
  await expect(kale).toContainText("Bill KT/26-27/0001 · ₹270");
  for (const row of [agarwal, kale]) {
    await expect(row.getByRole("button", { name: "Print bill" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Share PDF on WhatsApp" })).toBeVisible();
  }

  if (mobile()) {
    // a phone: the PDF goes to the share list, where WhatsApp is
    await agarwal.getByRole("button", { name: "Share PDF on WhatsApp" }).click();
    await expect
      .poll(() => customer.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length), { timeout: 30_000 })
      .toBe(1);
    const [files] = await customer.evaluate(() => (window as unknown as { __shared: { name: string; type: string; size: number; head: string }[][] }).__shared);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "Agarwal-General-Stores-bill-20261107-00031.pdf", type: "application/pdf", head: "%PDF-" });
    expect(files[0].size).toBeGreaterThan(5_000);
  } else {
    // a computer: the PDF is saved, and WhatsApp Web opens with the view-only link
    const [whatsapp, saved] = await Promise.all([
      customer.context().waitForEvent("page"),
      customer.waitForEvent("download"),
      agarwal.getByRole("button", { name: "Share PDF on WhatsApp" }).click(),
    ]);
    await expectPdf(saved, /^Agarwal-General-Stores-bill-20261107-00031\.pdf$/);
    await expect.poll(() => whatsapp.url(), { timeout: 30_000 }).toMatch(/^https:\/\/wa\.me\/\?text=/);
    // WhatsApp took the waiting window's place: Back there doesn't land on an empty page
    expect(await whatsapp.evaluate(() => history.length)).toBe(1);
    const text = decodeURIComponent(new URL(whatsapp.url()).searchParams.get("text")!);
    expect(text).toMatch(LINK_TEXT);
    await expect(agarwal.locator(".bill-actions-status")).toContainText("The PDF is in your downloads");
  }

  // Print opens the provider's bill on its own, ready to print
  const printed = await printFrom(customer, kale.getByRole("button", { name: "Print bill" }));
  expect(printed.url()).toContain(`bill=${kaleId}`);
  expect(printed.url()).toContain("print=1");
  await expect(printed.getByText("BILL OF SUPPLY", { exact: false }).first()).toBeVisible();
  await expect(printed.locator("body")).toContainText(KALE_GSTIN);
  await expect(printed.locator("body")).toContainText("Sold through Agarwal Online");
  await expect(printed.getByRole("button", { name: "Share PDF on WhatsApp" })).toBeVisible();
  // the bill page's own Download PDF saves the PDF and stays on the bill
  const billUrl = printed.url();
  const [fromBill] = await Promise.all([printed.waitForEvent("download"), printed.getByRole("button", { name: "Download PDF" }).click()]);
  await expectPdf(fromBill, /^Kale-Toys-and-Games-bill-KT-26-27-0001\.pdf$/);
  await expect(printed.locator("#bb-status")).toHaveText("The PDF is in your downloads.");
  expect(printed.url()).toBe(billUrl);
  if (mobile()) {
    // opened in place: Back comes back to the order
    await printed.getByRole("button", { name: "Back" }).click();
    await customer.waitForURL(`**/account/orders/${orderId}`);
  } else {
    // a tab of its own has nothing to go back to
    await expect(printed.getByRole("button", { name: "Back" })).toBeHidden();
    await printed.close();
  }

  // Download PDF: the PDF itself
  const [download] = await Promise.all([customer.waitForEvent("download"), kale.getByRole("button", { name: "Download PDF" }).click()]);
  await expectPdf(download, /^Kale-Toys-and-Games-bill-KT-26-27-0001\.pdf$/);
  await expect(kale.locator(".bill-actions-status")).toHaveText("The PDF is in your downloads.");
  // pictures only after the phone-only steps (Share, Print): a full-page screenshot switches an emulated phone's touch off
  await shot(customer, "order-page");
});

test("a PDF that can't be made says why, and the page stays as it was", async ({ browser, page }) => {
  const customer = await signedIn(browser, page, SHOPPER);
  await customer.goto(`/account/orders/${orderId}`);
  const kale = customer.locator("#bills > li").filter({ hasText: "Kale Toys and Games" });
  const pdf = "**/api/invoices/*/pdf**";
  const failing = async (status: number, body: string, contentType = "text/plain; charset=utf-8") => {
    await customer.unroute(pdf);
    await customer.route(pdf, (route) => route.fulfill({ status, contentType, body }));
  };
  const before = customer.url();

  // the server's own reason, word for word
  await failing(503, "The PDF couldn't be made just now. Try again, or use Print bill.");
  await kale.getByRole("button", { name: "Download PDF" }).click();
  await expect(kale.locator(".bill-actions-status")).toHaveText("The PDF couldn't be made just now. Try again, or use Print bill.");
  await failing(429, "Too many PDFs in a short time. Try again in a while.");
  await kale.getByRole("button", { name: "Download PDF" }).click();
  await expect(kale.locator(".bill-actions-status")).toHaveText("Too many PDFs in a short time. Try again in a while.");
  // the host's own error page for a PDF that ran out of time: our words instead of its page
  await failing(504, "<!doctype html><title>504</title><h1>FUNCTION_INVOCATION_TIMEOUT</h1>", "text/html");
  await kale.getByRole("button", { name: "Download PDF" }).click();
  await expect(kale.locator(".bill-actions-status")).toContainText("The PDF took too long to make");
  // something that isn't a PDF, served as if it were, is never saved
  await failing(200, "<html>Sign in</html>", "application/pdf");
  await kale.getByRole("button", { name: "Download PDF" }).click();
  await expect(kale.locator(".bill-actions-status")).toContainText("Couldn’t make the PDF just now");
  // Share still gets the bill to WhatsApp: its view-only link, after the reason
  await failing(503, "The PDF couldn't be made just now. Try again, or use Print bill.");
  const sharedText = () => customer.evaluate(() => (window as unknown as { __sharedText: string[] }).__sharedText);
  if (mobile()) {
    await kale.getByRole("button", { name: "Share PDF on WhatsApp" }).click();
    await expect.poll(sharedText).toEqual([expect.stringMatching(LINK_TEXT)]);
    await expect(kale.locator(".bill-actions-status")).toHaveText("Shared a link to the bill: whoever opens it can download the PDF.");
    // a PDF slower than the share list waits for (the live server starting up): the link goes instead
    await customer.unroute(pdf);
    await customer.route(pdf, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route.continue().catch(() => {});
    });
    await kale.getByRole("button", { name: "Share PDF on WhatsApp" }).click();
    await expect.poll(() => sharedText().then((texts) => texts.length), { timeout: 10_000 }).toBe(2);
    await failing(503, "The PDF couldn't be made just now. Try again, or use Print bill.");
  } else {
    const [whatsapp] = await Promise.all([customer.context().waitForEvent("page"), kale.getByRole("button", { name: "Share PDF on WhatsApp" }).click()]);
    await expect.poll(() => whatsapp.url(), { timeout: 30_000 }).toMatch(/^https:\/\/wa\.me\/\?text=.*%2Fb%2F/);
    await expect(kale.locator(".bill-actions-status")).toHaveText(
      "The PDF couldn't be made just now. Try again, or use Print bill. WhatsApp opens with a link to the bill.",
    );
    await whatsapp.close();
  }
  await expect(kale.getByRole("button", { name: "Share PDF on WhatsApp" })).toBeEnabled();
  expect(customer.url()).toBe(before);

  // the bill page's own bar says why too
  await customer.goto(`/api/invoices/${orderId}?bill=${kaleId}&view=1`);
  await customer.getByRole("button", { name: "Download PDF" }).click();
  await expect(customer.locator("#bb-status")).toHaveText("The PDF couldn't be made just now. Try again, or use Print bill.");
  await expect(customer.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await customer.unroute(pdf);
  await customer.context().close();
});

test("a phone browser that can't share files saves the PDF and offers Open WhatsApp", async ({ browser, page }) => {
  test.skip(!mobile(), "a phone's share list; a computer always saves and opens WhatsApp Web");
  const customer = await signedIn(browser, page, SHOPPER);
  // Firefox, and some apps' own browsers: no file sharing
  await customer.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }));
  await customer.goto(`/account/orders/${orderId}`);
  const agarwal = customer.locator("#bills > li").filter({ hasText: "Agarwal General Stores" });
  const [saved] = await Promise.all([customer.waitForEvent("download"), agarwal.getByRole("button", { name: "Share PDF on WhatsApp" }).click()]);
  await expectPdf(saved, /^Agarwal-General-Stores-bill-20261107-00031\.pdf$/);
  await expect(agarwal.locator(".bill-actions-status")).toContainText("Tap Open WhatsApp");
  // a window opened after the wait would be blocked: the tap on Open WhatsApp opens it
  const [whatsapp] = await Promise.all([customer.context().waitForEvent("page"), agarwal.getByRole("button", { name: "Open WhatsApp" }).click()]);
  await expect.poll(() => whatsapp.url(), { timeout: 30_000 }).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(new URL(whatsapp.url()).searchParams.get("text")!)).toMatch(/\/b\/[A-Za-z0-9_-]{24}$/);

  // the bill page's bar does the same
  await customer.goto(`/api/invoices/${orderId}?view=1`);
  await Promise.all([customer.waitForEvent("download"), customer.getByRole("button", { name: "Share PDF on WhatsApp" }).click()]);
  await expect(customer.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*%2Fb%2F/);
  await shot(customer, "open-whatsapp");
  await customer.context().close();
});

test("each delivered order in the history has the two bill buttons", async ({ browser, page }) => {
  const customer = await signedIn(browser, page, SHOPPER);
  await customer.goto("/account/orders");
  const row = customer.locator("li.has-bills", { hasText: "AGS-20261107-00031" });
  await expect(row.getByRole("button", { name: "Print bills" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Share PDF on WhatsApp" })).toBeVisible();
  if (mobile()) {
    // both bills go to the share list together
    await row.getByRole("button", { name: "Share PDF on WhatsApp" }).click();
    await expect
      .poll(() => customer.evaluate(() => (window as unknown as { __shared: { name: string }[][] }).__shared[0]?.map((file) => file.name) ?? []), {
        timeout: 30_000,
      })
      .toEqual(["Agarwal-General-Stores-bill-20261107-00031.pdf", "Kale-Toys-and-Games-bill-KT-26-27-0001.pdf"]);
  }
  await shot(customer, "history");
  // with two bills, Print goes to the order's bills to pick one
  await row.getByRole("button", { name: "Print bills" }).click();
  await customer.waitForURL(`**/account/orders/${orderId}#bills`);
  await expect(customer.locator("#bills > li")).toHaveCount(2);
});

test("the family's spend list has the bill buttons: the buyer's one pair, a relative's one pair per bill", async ({ browser, page }) => {
  // the buyer: one pair for both bills, and Print goes to the order's bills to pick one
  const buyer = await signedIn(browser, page, SHOPPER);
  await buyer.goto("/account/family#spend");
  const own = buyer.locator(".spend-row", { hasText: "AGS-20261107-00031" });
  await expect(own.getByRole("button", { name: "Print bills" })).toBeVisible();
  await expect(own.getByRole("button", { name: "Share PDF on WhatsApp" })).toHaveCount(1);
  await buyer.context().close();

  // a relative can't open the order's page, so each bill has its own Print and Share
  const relative = await signedIn(browser, page, RELATIVE);
  await relative.goto("/account/family#spend");
  const row = relative.locator(".spend-row", { hasText: "AGS-20261107-00031" });
  const bills = row.locator(".spend-bill");
  await expect(bills).toHaveCount(2);
  await expect(bills.nth(0)).toContainText("Agarwal’s bill");
  await expect(bills.nth(1)).toContainText("Kale Toys and Games");
  for (const index of [0, 1]) {
    await expect(bills.nth(index).getByRole("button", { name: "Print bill" })).toBeVisible();
    await expect(bills.nth(index).getByRole("button", { name: "Share PDF on WhatsApp" })).toBeVisible();
  }
  if (mobile()) {
    await bills.nth(1).getByRole("button", { name: "Share PDF on WhatsApp" }).click();
    await expect
      .poll(() => relative.evaluate(() => (window as unknown as { __shared: { name: string }[][] }).__shared[0]?.map((file) => file.name) ?? []), {
        timeout: 30_000,
      })
      .toEqual(["Kale-Toys-and-Games-bill-KT-26-27-0001.pdf"]);
  }
  const printed = await printFrom(relative, bills.nth(1).getByRole("button", { name: "Print bill" }));
  expect(printed.url()).toContain(`bill=${kaleId}`);
  await expect(printed.locator("body")).toContainText("Kale Toys and Games");
  if (mobile()) {
    await printed.getByRole("button", { name: "Back" }).click();
    await relative.waitForURL("**/account/family**");
  }
  await shot(relative, "family");
  await relative.context().close();
});

test("the view-only link opens the bills signed out, and only with the right code", async ({ browser, page }) => {
  const order = await Order.findById(orderId);
  const code = order.billShareToken ?? "AbCdEfGhIjKlMnOpQrStUvWx";
  if (!order.billShareToken) await Order.updateOne({ _id: orderId }, { $set: { billShareToken: code } });
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: page.viewportSize()!, isMobile: mobile(), acceptDownloads: true });
  const guest = await context.newPage();
  await guest.goto(`/b/${code}`);
  await expect(guest.getByRole("heading", { level: 1, name: "Your bills" })).toBeVisible();
  const rows = guest.locator(".order-bills > li");
  await expect(rows).toHaveCount(2);
  await shot(guest, "link");
  const kaleRow = rows.filter({ hasText: "Kale Toys and Games" });
  const [download] = await Promise.all([guest.waitForEvent("download"), kaleRow.getByRole("button", { name: "Download PDF" }).click()]);
  await expectPdf(download, /^Kale-Toys-and-Games-bill-KT-26-27-0001\.pdf$/);
  // saved without leaving the page (a plain link to the PDF left a blank page behind in some phone browsers)
  await expect(kaleRow.locator(".bill-actions-status")).toHaveText("The PDF is in your downloads.");
  expect(new URL(guest.url()).pathname).toBe(`/b/${code}`);
  // View bill opens the bill in place; its Back comes back to the link
  await kaleRow.getByRole("link", { name: "View bill" }).click();
  await guest.waitForURL(/\/api\/invoices\/.*view=1/);
  await expect(guest.locator("body")).toContainText(KALE_GSTIN);
  await guest.getByRole("button", { name: "Back" }).click();
  await guest.waitForURL(`**/b/${code}`);
  // the PDF failing there says why, and stays
  await guest.route("**/api/invoices/*/pdf**", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain; charset=utf-8", body: "The PDF couldn't be made just now. Try again, or use Print bill." }),
  );
  await guest.locator(".order-bills > li").filter({ hasText: "Kale Toys and Games" }).getByRole("button", { name: "Download PDF" }).click();
  await expect(guest.locator(".order-bills > li").filter({ hasText: "Kale Toys and Games" }).locator(".bill-actions-status")).toHaveText(
    "The PDF couldn't be made just now. Try again, or use Print bill.",
  );
  expect(new URL(guest.url()).pathname).toBe(`/b/${code}`);
  await guest.unroute("**/api/invoices/*/pdf**");
  // a wrong code, or no code and no sign-in, shows nothing (the page streams, so the not-found page can
  // arrive with a 200: check what is on it)
  await guest.goto(`/b/${code.replace(/^./, (c: string) => (c === "A" ? "B" : "A"))}`);
  await expect(guest.getByRole("heading", { level: 1, name: "We couldn’t find that page." })).toBeVisible();
  await expect(guest.locator(".order-bills")).toHaveCount(0);
  expect((await guest.request.get(`/api/invoices/${orderId}/pdf`)).status()).toBeGreaterThanOrEqual(400);
  expect((await guest.request.get(`/api/invoices/${orderId}?view=1`)).status()).toBeGreaterThanOrEqual(400);
  await context.close();
  // another customer gets neither the bill, its PDF nor a link to it
  const other = await signedIn(browser, page, OTHER);
  for (const path of [`/api/invoices/${orderId}?view=1`, `/api/invoices/${orderId}/pdf`, `/api/invoices/${orderId}/pdf?bill=${kaleId}`])
    expect((await other.request.get(path)).status()).toBe(404);
  expect((await other.request.post(`/api/invoices/${orderId}/link`)).status()).toBe(404);
  await other.context().close();
});

test("staff get the bills on the order page and the packing slip, and Share opens the customer's chat", async ({ browser, page }) => {
  const staff = await signedIn(browser, page, ADMIN);
  await staff.goto(`/admin/orders/${orderId}#bill`);
  const bills = staff.locator("#bills > li");
  await expect(bills).toHaveCount(2);
  await shot(staff, "staff-order");
  if (!mobile()) {
    const [whatsapp] = await Promise.all([
      staff.context().waitForEvent("page"),
      staff.waitForEvent("download"),
      bills.filter({ hasText: "Kale Toys and Games" }).getByRole("button", { name: "Share PDF on WhatsApp" }).click(),
    ]);
    await expect.poll(() => whatsapp.url(), { timeout: 30_000 }).toMatch(new RegExp(`^https://wa\\.me/91${SHOPPER.phone}\\?text=`));

    // a link sent to the wrong person: a new one turns the old one off
    const old = (await Order.findById(orderId)).billShareToken;
    await staff.reload();
    const reset = staff.locator(".bill-link-reset");
    await reset.getByRole("button", { name: "Make a new bill link" }).click();
    await staff.getByRole("button", { name: /^Yes, / }).click();
    await expect(reset.getByRole("status")).toContainText("New link made");
    const fresh = (await Order.findById(orderId)).billShareToken;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(fresh).not.toBe(old);
    await staff.goto(`/b/${old}`);
    await expect(staff.getByRole("heading", { level: 1, name: "We couldn’t find that page." })).toBeVisible();
    await staff.goto(`/b/${fresh}`);
    await expect(staff.locator(".order-bills > li")).toHaveCount(2);
  }
  await staff.goto(`/admin/orders/${orderId}/slip`);
  await expect(staff.locator(".slip-actions #bills > li")).toHaveCount(2);
  // never on the printed slip
  await staff.emulateMedia({ media: "print" });
  await expect(staff.locator(".slip-actions:has(#bills)")).toBeHidden();
  await staff.emulateMedia({ media: "screen" });
});

test("an admin's change to a provider's tax details waits for the owner, who approves it", async ({ browser, page }) => {
  test.skip(mobile(), "one run is enough: the same form at phone width is checked by the layout test");
  const patil = await Provider.findOne({ name: "Patil Crafts" });
  const admin = await signedIn(browser, page, ADMIN);
  await admin.goto(`/admin/providers?edit=${patil._id}#provider`);
  const section = admin.locator("section.provider-billing");
  await expect(section.getByRole("heading", { name: "Tax and billing" })).toBeVisible();
  // the provider's own bills stay locked until its checklist is done
  await section.getByLabel("The provider, in its own name").check();
  await section.getByRole("button", { name: "Send to an owner" }).click();
  await expect(section.getByText(/Finish the checklist/)).toBeVisible({ timeout: 30_000 });
  await section.getByLabel(/^Legal name on its bills/).fill("Patil Crafts LLP");
  await section.getByLabel("GST registration").selectOption("regular");
  await section.getByLabel(/^GSTIN/).fill(gstin("27PATIL1234C1Z"));
  await section.getByLabel(/^Bill number prefix/).fill("pc");
  await section.getByLabel("Address on its bills").fill("Market Road, Roha 402109");
  await section.getByLabel(/^Bill style/).selectOption("bilingual");
  await section.getByLabel(/has agreed in writing/).check();
  await section.getByRole("button", { name: "Send to an owner" }).click();
  await expect(section.getByText("Sent to an owner for approval. Bills don't change until it's approved.")).toBeVisible({ timeout: 30_000 });
  await shot(admin, "admin-billing");
  expect((await Provider.findById(patil._id)).billing?.ownBills ?? false).toBe(false);

  const owner = await signedIn(browser, page, OWNER);
  const request = await ApprovalRequest.findOne({ kind: "provider-billing", state: "pending" });
  await owner.goto(`/super-admin/approvals?review=${request._id}#review`);
  const review = owner.locator("#review");
  await expect(review).toContainText("Provider tax details: Patil Crafts, Roha");
  await expect(review).toContainText("Patil Crafts LLP");
  await shot(owner, "approval");
  await review.getByRole("button", { name: "Record decision" }).click();
  await owner.getByRole("button", { name: /^Yes, / }).click();
  await expect
    .poll(async () => (await Provider.findById(patil._id)).billing?.ownBills ?? false, { timeout: 30_000 })
    .toBe(true);
  const saved = (await Provider.findById(patil._id)).billing;
  expect(saved).toMatchObject({ legalName: "Patil Crafts LLP", prefix: "PC", stateCode: "27", style: "bilingual" });
  await owner.goto("/admin/providers");
  await expect(owner.locator("tr", { hasText: "Patil Crafts" })).toContainText("Its own");
});
