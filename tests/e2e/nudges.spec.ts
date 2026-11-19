// Buy it again, "Tell me when it's back" and UPI at the door, at desktop and phone width: a shopper's
// You page lists what they've bought, a sold-out pack's page takes an alert (a guest signs in first),
// a rider picks UPI and shows the order's QR code, and the owner confirms the payment came in.
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { InventoryReservation, Order, SystemSetting } from "../../src/lib/commerce/models";
import { StockAlert } from "../../src/lib/engagement/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const PEOPLE = {
  shopper: { name: "Nudge Shopper", email: "nudge-shopper@e2e.test", phone: "9000000221", roles: ["customer"] },
  rider: { name: "Nudge Rider", email: "nudge-rider@e2e.test", phone: "9000000222", roles: ["customer", "delivery"] },
  owner: { name: "Nudge Owner", email: "nudge-owner@e2e.test", phone: "9000000223", roles: ["customer", "super-admin"] },
};
type Who = keyof typeof PEOPLE;
const out = process.env.SHOT_DIR;
let riderOrder = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [shopper, rider] = await User.create(Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })));
  const category = await Category.create({ slug: "fictional-stationery", name: { en: "Fictional Stationery", mr: "स्टेशनरी" } });
  const product = (slug: string, name: string) =>
    Product.create({ slug, name: { en: name, mr: name }, description: { en: name, mr: name }, categoryId: category._id, categorySlug: category.slug, status: "published" });
  const [markers, pens] = await Promise.all([product("fictional-marker-set", "Fictional Marker Set"), product("fictional-gel-pen", "Fictional Gel Pen")]);
  const pack = (productId: unknown, sku: string) =>
    ProductVariant.create({ productId, sku, label: "Pack of 5", unit: "piece", packQuantity: 5, pricePaise: 9900, mrpPaise: 9900 });
  const [markerPack, penPack] = await Promise.all([pack(markers._id, "FMK-5"), pack(pens._id, "FGP-5")]);
  // markers are sold out; the one pen is held for the rider's order
  await InventoryItem.create([
    { variantId: markerPack._id, onHand: 0, reserved: 0 },
    { variantId: penPack._id, onHand: 1, reserved: 1 },
  ]);
  const order = (number: string, variantId: unknown, extra: Record<string, unknown>) =>
    Order.create({
      customerId: shopper._id,
      number,
      idempotencyKey: number,
      items: [{ variantId, name: "Fictional item", label: "Pack of 5", quantity: 1, pricePaise: 9900, linePaise: 9900 }],
      address: { name: PEOPLE.shopper.name, phone: PEOPLE.shopper.phone, line: "Fictional House 9", pin: "999999", areaName: "Nagothane" },
      slotId: new mongoose.Types.ObjectId(),
      deliveryDate: "2026-11-19",
      deliveryWindow: "4–7 PM",
      subtotalPaise: 9900,
      deliveryPaise: 0,
      totalPaise: 9900,
      paymentMethod: "cod",
      ...extra,
    });
  // bought markers before: they come back under Buy it again
  await order("NUDGE-OLD-1", markerPack._id, { orderStatus: "completed", fulfilmentStatus: "ready", deliveryStatus: "delivered" });
  const out = await order("NUDGE-UPI-1", penPack._id, {
    orderStatus: "confirmed",
    fulfilmentStatus: "ready",
    deliveryStatus: "out-for-delivery",
    assignedTo: rider._id,
  });
  riderOrder = String(out._id);
  await InventoryReservation.create({ orderId: out._id, variantId: penPack._id, quantity: 1 });
  // the shop takes UPI: its ID is in Settings → School quotations; the owner switches it on below
  await SystemSetting.create({ key: "shop-quotation", value: { upiId: "agarwal@okaxis", accountName: "Agarwal General Stores" } });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, info: TestInfo, who: Who) {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

test("a shopper sees what they buy again, and asks to hear when a sold-out pack is back", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "shopper");
  // the delivered order's "How did we do?" can open over the page at any moment: closed, as a shopper would
  await page.addLocatorHandler(page.getByRole("heading", { name: "How did we do?" }), () => page.keyboard.press("Escape"));
  await page.goto("/account");
  const again = page.locator("section.account-again");
  await expect(again.getByText("Fictional Marker Set")).toBeVisible();
  if (out) await again.screenshot({ path: `${out}/${info.project.name}_buy-again.png` });

  await page.goto("/products/fictional-marker-set");
  await page.getByRole("button", { name: "Tell me when it’s back" }).click();
  await expect(page.getByText("We’ll tell you when it’s back")).toBeVisible();
  await expect(page.getByRole("button", { name: "Don’t tell me" })).toBeVisible();
  expect(await StockAlert.countDocuments()).toBe(1);
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_tell-me.png` });
  await page.getByRole("button", { name: "Don’t tell me" }).click();
  await expect(page.getByRole("button", { name: "Tell me when it’s back" })).toBeVisible();
  expect(await StockAlert.countDocuments()).toBe(0);
  await page.context().close();

  // signed out: the same button takes them to sign in, and back to this page after
  const guest = await browser.newPage({ baseURL: info.project.use.baseURL });
  await guest.goto("/products/fictional-marker-set");
  await expect(guest.getByRole("link", { name: "Tell me when it’s back" })).toHaveAttribute("href", "/login?then=%2Fproducts%2Ffictional-marker-set");
  await guest.close();
});

test("the owner switches on UPI at the door in Settings", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "owner");
  await page.goto("/super-admin");
  // the UPI ID is already in School quotations, but that alone doesn't turn it on
  const row = page.getByRole("link", { name: /Paying at the door/ });
  await expect(row).toContainText("Cash only");
  await row.click();
  const section = page.locator("#payments");
  await expect(section.getByText("UPI payments go to agarwal@okaxis.")).toBeVisible();
  await section.getByLabel("Delivery partners can take UPI at the door").check();
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Saved. Delivery partners see it on their next order.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_upi-setting.png`, fullPage: true });
  await page.goto("/super-admin");
  await expect(page.getByRole("link", { name: /Paying at the door/ })).toContainText("Cash or UPI to agarwal@okaxis");
  await page.context().close();
});

test("the rider takes UPI at the door with the order's QR code", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "rider");
  await page.goto(`/delivery/orders/${riderOrder}`);
  const qr = page.getByRole("img", { name: /^UPI QR code: pay ₹99 to Agarwal General Stores$/ });
  // cash until UPI is picked
  await expect(qr).toBeHidden();
  await expect(page.getByText("collected ₹99 in cash")).toBeVisible();
  await page.getByLabel("UPI", { exact: true }).check();
  await expect(qr).toBeVisible();
  await expect(page.getByText("collected ₹99 in cash")).toBeHidden();
  // big enough to scan, and never wider than the screen
  const box = (await qr.boundingBox())!;
  expect(box.width).toBeGreaterThan(200);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_upi-at-door.png`, fullPage: true });
  await page.getByLabel("Customer delivery code").fill("246810");
  await page.getByText("saw the customer’s UPI payment of ₹99 go through").click();
  await page.getByRole("button", { name: "Verify code & mark delivered" }).click();
  await expect(page.getByText("NUDGE-UPI-1. ₹99 was paid by UPI: nothing to hand over.")).toBeVisible();
  await expect(page.getByText("No cash with you right now.")).toBeVisible();
  await page.context().close();
});

test("the owner confirms the UPI payment came in", async ({ browser }, info) => {
  const page = await signedIn(browser, info, "owner");
  // nothing on the page logs an error (in development, Next's "Issue" badge)
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/admin/cod");
  const upi = page.locator("section[aria-labelledby=\"upi-title\"]");
  await expect(upi.getByRole("link", { name: "NUDGE-UPI-1" })).toBeVisible();
  // a picture only once the page is live: one taken mid-hydration tints the inputs and Next reports a mismatch
  await page.waitForLoadState("networkidle");
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_upi-to-check.png`, fullPage: true });
  await upi.getByRole("button", { name: "Got ₹99" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Yes, / }).click();
  await expect(page.getByText("UPI payment for NUDGE-UPI-1 confirmed. The order is settled.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "UPI payments to check" })).toBeHidden();
  expect(errors).toEqual([]);
  await page.context().close();
});
