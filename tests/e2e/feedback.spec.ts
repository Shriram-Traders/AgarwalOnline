// Rating an order after delivery, at desktop and phone width: the "How did we do?" popup, rating
// later from the order page, Marathi, and the owner's page where the ratings are read and answered.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Category, Product, ProductVariant, InventoryItem, ServiceArea } from "../../src/lib/db/models";
import { Order, OrderTimelineEvent } from "../../src/lib/commerce/models";
import { OrderFeedback } from "../../src/lib/feedback/models";
import { ProductReview } from "../../src/lib/reviews/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const PEOPLE = {
  shopper: { name: "Asha Patil", email: "feedback-shopper@e2e.test", phone: "9000000201", roles: ["customer"] },
  owner: { name: "Feedback Owner", email: "feedback-owner@e2e.test", phone: "9000000202", roles: ["customer", "super-admin"] },
  admin: { name: "Feedback Admin", email: "feedback-admin@e2e.test", phone: "9000000203", roles: ["customer", "admin"] },
  rider: { name: "Sunil Rider", email: "feedback-rider@e2e.test", phone: "9000000204", roles: ["customer", "delivery"] },
};
type Who = "shopper" | "owner" | "admin";
const out = process.env.SHOT_DIR;
let shopperId = "";
let riderId = "";
let variantId = "";
let productId = "";
const orders: Record<string, string> = {};

test.describe.configure({ mode: "serial" });

/** A delivered order for the shopper, brought by the rider just now. */
async function deliver(number: string) {
  const order = await Order.create({
    customerId: shopperId,
    number,
    idempotencyKey: number,
    items: [{ variantId, name: "Fictional Gel Pen", label: "Pack of 5", quantity: 1, pricePaise: 9900, linePaise: 9900 }],
    address: { name: PEOPLE.shopper.name, phone: PEOPLE.shopper.phone, line: "Fictional House 9", pin: "999999", areaName: "Nagothane" },
    slotId: new mongoose.Types.ObjectId(),
    deliveryDate: "2026-10-05",
    deliveryWindow: "4–7 PM",
    subtotalPaise: 9900,
    deliveryPaise: 0,
    totalPaise: 9900,
    paymentMethod: "cod",
    orderStatus: "confirmed",
    fulfilmentStatus: "ready",
    deliveryStatus: "delivered",
    assignedTo: riderId,
  });
  await OrderTimelineEvent.create({ orderId: order._id, actorId: riderId, dimension: "delivery", previous: "out-for-delivery", next: "delivered" });
  orders[number] = String(order._id);
  return String(order._id);
}

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await OrderFeedback.init();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [shopper, , , rider] = await User.create(
    Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })),
  );
  shopperId = String(shopper._id);
  riderId = String(rider._id);
  await ServiceArea.create({ key: "nagothane", name: "Nagothane", pincodes: ["999999"], enabled: true, feePaise: 3000 });
  const category = await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
  const product = await Product.create({
    slug: "fictional-gel-pen",
    name: { en: "Fictional Gel Pen", mr: "जेल पेन" },
    description: { en: "Fictional pen", mr: "पेन" },
    brand: "TEST BRAND",
    categoryId: category._id,
    categorySlug: "stationery",
    status: "published",
    bestseller: true,
  });
  const variant = await ProductVariant.create({
    productId: product._id,
    sku: "FB-GEL-5",
    label: "Pack of 5",
    unit: "piece",
    packQuantity: 5,
    pricePaise: 9900,
    mrpPaise: 9900,
  });
  await InventoryItem.create({ variantId: variant._id, onHand: 30 });
  variantId = String(variant._id);
  productId = String(product._id);
  await deliver("AGS-E2E-FB-1");
});

const pages = new Map<Who, Page>();
async function as(who: Who, browser: Browser, info: TestInfo): Promise<Page> {
  const open = pages.get(who);
  if (open && !open.isClosed()) return open;
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  pages.set(who, page);
  return page;
}
test.afterAll(async () => {
  for (const page of pages.values()) await page.context().close();
  pages.clear();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const sheet = (page: Page) => page.getByRole("dialog", { name: "How did we do?" });
/** The popup takes a moment to open; this is long enough to say it isn't going to. */
async function expectNoPopup(page: Page) {
  await page.waitForTimeout(2500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function shot(page: Page, name: string, info: TestInfo) {
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_feedback-${name}.png`, fullPage: true });
}

test("after a delivery the shop asks once, and a rating with tags goes through", async ({ browser }, info) => {
  const page = await as("shopper", browser, info);
  // signing in lands on the shop, which is where the question comes up
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Order AGS-E2E-FB-1 arrived");
  await expect(dialog.getByText("Tap a star. One tap is enough.")).toBeVisible();
  await shot(page, "popup", info);

  // Send without a star says what to do instead of sending
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Tap a star first.");

  // the stars are radio buttons: Space picks, the arrows move
  const rating = dialog.getByRole("group", { name: "Rate this order" });
  await rating.getByRole("radio", { name: "5 stars – Excellent" }).focus();
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("group", { name: "What did you like?" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(rating.getByRole("radio", { name: "3 stars – Okay" })).toBeChecked();
  await expect(dialog.getByRole("group", { name: "What went wrong?" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(rating.getByRole("radio", { name: "5 stars – Excellent" })).toBeChecked();

  // a star is big enough for a thumb, and the sheet never makes the page scroll sideways
  const star = await rating.locator("label").first().boundingBox();
  expect(star!.width).toBeGreaterThanOrEqual(44);
  expect(star!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const liked = dialog.getByRole("group", { name: "What did you like?" });
  await liked.getByRole("button", { name: "On time" }).click();
  await liked.getByRole("button", { name: "Well packed" }).click();
  await expect(liked.getByRole("button", { name: "On time" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("group", { name: "Rate your delivery partner" }).locator("label").nth(4).click();
  await dialog.getByLabel(/Tell us more/).fill("Neatly packed, thank you.");
  await shot(page, "popup-filled", info);
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);

  await dialog.getByRole("button", { name: "Send" }).click();
  const thanks = page.getByRole("dialog", { name: "Thank you!" });
  await expect(thanks.getByRole("status")).toHaveText("Your feedback reached the shop.");
  // a happy customer isn't pointed at complaints
  await expect(thanks.getByRole("link", { name: "Report a problem with an item" })).toHaveCount(0);
  await thanks.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const saved = await OrderFeedback.findOne({ orderId: orders["AGS-E2E-FB-1"] }).lean<Record<string, unknown>>();
  expect(saved).toMatchObject({
    state: "rated",
    rating: 5,
    tags: ["on-time", "well-packed"],
    riderRating: 5,
    riderName: "Sunil Rider",
    comment: "Neatly packed, thank you.",
    locale: "en",
  });
  // it never asks about the same order again
  await page.reload();
  await expectNoPopup(page);
});

test("Not now is remembered, and the basket is never interrupted", async ({ browser }, info) => {
  const page = await as("shopper", browser, info);
  const orderId = await deliver("AGS-E2E-FB-2");
  await page.goto("/cart");
  await expectNoPopup(page);
  await page.goto("/");
  const dialog = sheet(page);
  await expect(dialog).toContainText("Order AGS-E2E-FB-2 arrived");
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await OrderFeedback.findOne({ orderId }))?.state).toBe("skipped");
  await page.goto("/catalog");
  await expectNoPopup(page);
});

test("the order page still has the stars: a low rating points at the complaints form", async ({ browser }, info) => {
  const page = await as("shopper", browser, info);
  const orderId = orders["AGS-E2E-FB-2"];
  await page.goto(`/account/orders/${orderId}`);
  const card = page.locator("main").getByRole("region", { name: "How was this order?" });
  await expect(card).toBeVisible();
  await shot(page, "order-card", info);
  await card.locator("label").nth(1).click();
  const dialog = sheet(page);
  // the sheet opens with the star that was tapped on the page
  await expect(dialog.getByRole("group", { name: "Rate this order" }).getByRole("radio", { name: "2 stars – Poor" })).toBeChecked();
  const wrong = dialog.getByRole("group", { name: "What went wrong?" });
  await wrong.getByRole("button", { name: "Damaged item" }).click();
  await wrong.getByRole("button", { name: "Late delivery" }).click();
  await dialog.getByLabel(/Tell us more/).fill("The cover was torn and it came after 8 pm.");
  await dialog.getByRole("button", { name: "Send" }).click();

  const thanks = page.getByRole("dialog", { name: "Thank you!" });
  const report = thanks.getByRole("link", { name: "Report a problem with an item" });
  await expect(report).toHaveAttribute("href", `/account/complaints?order=${orderId}&type=damaged-item#report`);
  await report.click();
  await expect(page).toHaveURL(new RegExp(`/account/complaints\\?order=${orderId}&type=damaged-item#report$`));
  const form = page.locator("main #report");
  await expect(form.getByLabel("Order")).toHaveValue(orderId);
  await expect(form.getByLabel("Issue")).toHaveValue("damaged-item");

  // back on the order, the rating is shown instead of the stars
  await page.goto(`/account/orders/${orderId}`);
  const given = page.locator("main").getByRole("region", { name: "Your rating" });
  await expect(given).toContainText("Poor");
  await expect(given).toContainText("Damaged item");
  await expect(given).toContainText("The cover was torn and it came after 8 pm.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the question is asked in Marathi when the shop is", async ({ browser }, info) => {
  const page = await as("shopper", browser, info);
  await deliver("AGS-E2E-FB-3");
  const { hostname } = new URL(info.project.use.baseURL!);
  await page.context().addCookies([{ name: "ags_locale", value: "mr", domain: hostname, path: "/" }]);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "आमची सेवा कशी वाटली?" });
  await expect(dialog).toContainText("ऑर्डर AGS-E2E-FB-3 पोहोचली");
  await dialog.getByRole("radio", { name: "4 तारे – चांगले" }).focus();
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("group", { name: "काय आवडले?" }).getByRole("button", { name: "वेळेवर" })).toBeVisible();
  await shot(page, "popup-marathi", info);
  await dialog.getByRole("button", { name: "आत्ता नको" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.context().clearCookies({ name: "ags_locale" });
});

test("the owner reads the ratings, replies to the low one and the customer sees it", async ({ browser }, info) => {
  const owner = await as("owner", browser, info);
  // the low rating waits on the overview
  await owner.goto("/admin");
  const queue = owner.locator("main #needs-you");
  await expect(queue.getByRole("link", { name: "Low ratings to read", exact: true })).toBeVisible();
  // its button opens the oldest one, ready to answer
  await expect(queue.getByRole("link", { name: /^Read/ })).toHaveAttribute("href", /\/super-admin\/feedback\?tab=attention&reply=[a-f\d]{24}#reply$/);

  await owner.goto("/super-admin/feedback");
  const main = owner.locator("main");
  await expect(main.getByRole("heading", { name: "Ratings & feedback", level: 1 })).toBeVisible();
  await expect(main.getByRole("link", { name: "Needs attention: 1" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Needs attention (1)" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Unread (2)" })).toBeVisible();
  // low ratings come first
  const cards = main.locator(".feedback-list > li");
  await expect(cards).toHaveCount(2);
  const low = cards.nth(0);
  await expect(low).toContainText("AGS-E2E-FB-2");
  await expect(low).toContainText("Needs attention");
  await expect(low).toContainText("Damaged item");
  await expect(low).toContainText("The cover was torn and it came after 8 pm.");
  await expect(low.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+919000000201");
  await expect(cards.nth(1)).toContainText("Delivery partner Sunil Rider");
  await shot(owner, "owner", info);
  const results = await new AxeBuilder({ page: owner }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);

  // one reply box at the top, not a form on every card
  await low.getByRole("link", { name: "Reply" }).click();
  const panel = main.locator("#reply");
  await expect(panel).toBeFocused();
  await panel.getByLabel("Your reply to the customer").fill("Sorry about that. We will replace it tomorrow.");
  await panel.getByRole("button", { name: "Send reply" }).click();
  await owner.getByRole("button", { name: "Yes, send reply" }).click();
  // the form gives way to the reply that was sent
  await expect(panel.getByText("Sorry about that. We will replace it tomorrow.")).toBeVisible();
  await expect(panel.getByLabel("Your reply to the customer")).toHaveCount(0);
  await shot(owner, "owner-replied", info);
  // replying is reading: nothing needs attention now
  await expect(main.getByRole("link", { name: "Needs attention (0)" })).toBeVisible();

  await main.getByRole("link", { name: "Unread (1)" }).click();
  await expect(cards).toHaveCount(1);
  await cards.nth(0).getByRole("button", { name: "Mark as read" }).click();
  await expect(main.getByRole("heading", { name: "Everything is read" })).toBeVisible();
  await main.getByRole("link", { name: "All ratings" }).click();
  await expect(cards).toHaveCount(2);
  await main.getByLabel(/^Search/).fill("fb-2");
  await main.getByRole("button", { name: "Show ratings" }).click();
  await expect(cards).toHaveCount(1);

  // the customer is told, and sees the reply on the order
  const shopper = await as("shopper", browser, info);
  await shopper.goto(`/account/orders/${orders["AGS-E2E-FB-2"]}`);
  const given = shopper.locator("main").getByRole("region", { name: "Your rating" });
  await expect(given).toContainText("Reply from the shop");
  await expect(given).toContainText("Sorry about that. We will replace it tomorrow.");
  await shopper.goto("/account/notifications");
  await expect(shopper.locator("main").getByText("The shop replied to your rating")).toBeVisible();
});

test("the ratings are the owner's to read, not the team's", async ({ browser }, info) => {
  const admin = await as("admin", browser, info);
  await admin.goto("/super-admin/feedback");
  await expect(admin.getByRole("heading", { name: "Access restricted" })).toBeVisible();
  await admin.goto("/admin");
  await expect(admin.locator("main").getByRole("link", { name: "Low ratings to read" })).toHaveCount(0);
});

test("the owner hides a product review and shows it again", async ({ browser }, info) => {
  await ProductReview.create({
    productId,
    customerId: shopperId,
    verifiedOrderId: orders["AGS-E2E-FB-1"],
    rating: 4,
    title: "Smooth ink",
    body: "Writes well, one pen was dry.",
  });
  const owner = await as("owner", browser, info);
  await owner.goto("/super-admin/feedback?tab=reviews");
  const main = owner.locator("main");
  const card = main.locator(".feedback-list > li").first();
  await expect(card).toContainText("Fictional Gel Pen");
  await expect(card).toContainText("Shown in the shop");
  await shot(owner, "owner-reviews", info);

  await card.getByRole("link", { name: /^Hide/ }).click();
  const panel = main.locator("#review");
  await panel.getByLabel(/^Why/).fill("Being checked with the customer");
  await panel.getByRole("button", { name: "Hide review" }).click();
  await owner.getByRole("button", { name: "Yes, hide review" }).click();
  await expect(card).toContainText("Hidden");
  expect((await ProductReview.findOne({ productId }))?.status).toBe("hidden");

  await card.getByRole("link", { name: /^Show again/ }).click();
  await panel.getByLabel(/^Why/).fill("Checked: a fair review");
  await panel.getByRole("button", { name: "Show review again" }).click();
  await owner.getByRole("button", { name: "Yes, show review again" }).click();
  await expect(card).toContainText("Shown in the shop");
  expect((await ProductReview.findOne({ productId }))?.status).toBe("published");
});
