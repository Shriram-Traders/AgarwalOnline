// Round 1 of "easier to use", at desktop and phone width: the product page's − / + stepper, hearts
// that remember, Load more, recent and popular searches, the packing slip, the new-order sound and
// stock from a spreadsheet, and checkout's delivery times folded to two days. (Picking a delivery
// time is in store.spec, the rider's Call and Map in journey.spec.)
import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, ServiceArea, User } from "../../src/lib/db/models";
import { Address, DeliverySlot, Order, SystemSetting } from "../../src/lib/commerce/models";
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

/**
 * Each person signs in once per run and later tests reuse that session: sign-in by email allows five
 * tries a window per address (src/lib/auth/actions.ts), and this file opens more owner pages than that.
 */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function signedIn(browser: Browser, who: keyof typeof EMAILS, use: TestInfo["project"]["use"]): Promise<Page> {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = use;
  // per project: each one reseeds the database, which ends the sessions before it
  const key = `${test.info().project.name}:${who}`;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, storageState: sessions.get(key) });
  const page = await context.newPage();
  if (sessions.has(key)) return page;
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(EMAILS[who]);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  sessions.set(key, await context.storageState());
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
  const total = Number(/of (\d+)/.exec(await main.locator(".results-line").innerText())![1]);
  expect(total).toBeGreaterThan(48);
  await expect(main.locator(".product-grid > *")).toHaveCount(48);
  await main.getByRole("link", { name: `Load ${total - 48} more` }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(main.locator(".product-grid > *")).toHaveCount(total);
  await expect(main.getByRole("link", { name: /^Load \d+ more/ })).toHaveCount(0);
});

test("catalogue: the next products appear as you scroll, without tapping anything", async ({ page }) => {
  const loaded = page.waitForResponse((response) => response.url().includes("/api/catalog/all"));
  await page.goto("/catalog");
  await loaded;
  const main = page.locator("main");
  await expect(main.locator(".product-grid > *")).toHaveCount(48);
  await main.locator(".load-more").scrollIntoViewIfNeeded();
  await expect(main.locator(".product-grid > *")).not.toHaveCount(48);
  // the address remembers how far down, so Back from a product comes back to the same place
  await expect(page).toHaveURL(/page=2/);
});

test("catalogue: once the shop is loaded, shelves, search and sort change on the phone with no page from the server", async ({ page }) => {
  const loaded = page.waitForResponse((response) => response.url().includes("/api/catalog/all"));
  await page.goto("/catalog?category=stationery&in=desk");
  await loaded;
  // a page drawn by the server is asked for with the "rsc" header (prefetches aside); none may go out from here
  const fromServer: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (headers.rsc && !headers["next-router-prefetch"]) fromServer.push(request.url());
  });
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
  const rail = page.getByRole("navigation", { name: "Browse product categories" });
  const heading = page.getByRole("heading", { level: 1 });
  await rail.getByRole("link", { name: "Notebooks & Paper" }).click();
  await expect(page).toHaveURL(/category=paper&in=desk$/);
  await expect(heading).toHaveText("Notebooks & Paper");
  await expect(rail.getByRole("link", { name: "Notebooks & Paper" })).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveTitle("Notebooks & Paper online in Nagothane | Agarwal Online");
  await expect(page.locator("main .product-grid .product-card").first()).toBeVisible();
  // Back returns to the shelf before, still without the server
  await page.goBack();
  await expect(heading).toHaveText("Writing & Pens");
  // a search and a sort answer on the phone as well
  const toggle = page.getByRole("button", { name: /Filter & sort/ });
  if (await toggle.isVisible()) await toggle.click();
  const form = page.locator("#catalog-filter-form");
  await form.getByLabel("Sort by").selectOption("price-desc");
  await expect(page).toHaveURL(/sort=price-desc/);
  await form.getByRole("searchbox", { name: "Search" }).fill("gel pen");
  await expect(page).toHaveURL(/q=gel\+pen/);
  // a search from a shelf looks along that shelf, as the server's page does
  await expect(heading).toHaveText("Writing & Pens");
  await expect(page.locator("main .results-line")).toContainText("for “gel pen”");
  await expect(page.locator("main .product-grid .product-card").first()).toContainText(/gel/i);
  expect(fromServer).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
});

test("catalogue: a shelf in two sections shows in each one's rail, and a shelf leads on to the next", async ({ page }) => {
  // the seed puts "Writing & Pens" under Stationery and under Office
  await page.goto("/catalog?category=stationery&in=work");
  const rail = page.getByRole("navigation", { name: "Browse product categories" });
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("link", { name: "Office", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(rail.getByRole("link")).toHaveText(["Writing & Pens", "Office Supplies", "Notebooks & Paper"]);
  await expect(rail.getByRole("link", { name: "Writing & Pens" })).toHaveAttribute("aria-current", "page");
  // the other section opens at its first shelf, the same one, with its own neighbours
  await tabs.getByRole("link", { name: "Stationery", exact: true }).click();
  await expect(page).toHaveURL(/category=stationery&in=desk/);
  await expect(rail.getByRole("link")).toHaveCount(4);
  await expect(page.getByRole("heading", { level: 1, name: "Writing & Pens" })).toBeVisible();
  // one address per shelf for search engines, whichever section it was opened from
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/catalog\?category=stationery$/);
  await page.locator("main").getByRole("link", { name: /^Next: / }).click();
  await expect(page).toHaveURL(/in=desk/);
  await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  // a search looks through the whole shop: the rail steps aside
  await page.goto("/catalog?q=pen");
  await expect(rail).toHaveCount(0);
});

test("catalogue: Filter & sort applies as you pick or type, without reloading the page", async ({ page }) => {
  await page.goto("/catalog?category=stationery&in=desk");
  // a mark that a full page load would wipe
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
  const toggle = page.getByRole("button", { name: /Filter & sort/ });
  if (await toggle.isVisible()) await toggle.click();
  const form = page.locator("#catalog-filter-form");
  await form.getByLabel("Sort by").selectOption("price-asc");
  await expect(page).toHaveURL(/category=stationery&in=desk&sort=price-asc$/);
  const prices = await page.locator("main .product-grid .product-card .price-row strong").allInnerTexts();
  const rupees = prices.map((text) => Number(text.replace(/[^\d.]/g, "")));
  expect(rupees).toEqual([...rupees].sort((a, b) => a - b));
  await form.getByLabel("In stock only").check();
  await expect(page).toHaveURL(/inStock=true/);
  // Featured is the shop's own order: picking it back leaves the address clean
  await form.getByLabel("Sort by").selectOption({ label: "Featured" });
  await expect(page).toHaveURL(/category=stationery&in=desk&inStock=true$/);
  await form.getByRole("searchbox", { name: "Search" }).fill("gel pen");
  await expect(page).toHaveURL(/q=gel\+pen/);
  await expect(page.locator("main .product-grid .product-card").first()).toContainText(/gel/i);
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
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

test("checkout: two days of delivery times, the rest a tap away", async ({ browser }, info) => {
  // the demo shop's areas start switched off: deliver to the shopper's addresses for this test
  const addresses = await Address.find({}, "areaId pin");
  const areaIds = [...new Set(addresses.map((address) => String(address.areaId)))];
  const before = await ServiceArea.find({ _id: { $in: areaIds } }, "enabled pincodes").lean();
  for (const address of addresses)
    await ServiceArea.updateOne({ _id: address.areaId }, { $set: { enabled: true }, $addToSet: { pincodes: address.pin } });
  // four more days of times there, far ahead so none has passed (Sunday left out)
  for (const areaId of areaIds)
    for (const date of ["2099-01-01", "2099-01-02", "2099-01-03", "2099-01-05"])
      for (const [label, startMinutes, endMinutes] of [
        ["10:00 AM – 1:00 PM", 600, 780],
        ["4:00 PM – 7:00 PM", 960, 1140],
      ] as const)
        await DeliverySlot.updateOne(
          { areaId, date, label },
          { $setOnInsert: { startMinutes, endMinutes, capacity: 5 } },
          { upsert: true },
        );
  const page = await signedIn(browser, "customer", info.project.use);
  await page.goto(`/products/${product.slug}`);
  const main = page.locator("main");
  const add = main.getByRole("button", { name: "Add to basket" }).first();
  if (await add.isVisible()) {
    await add.click();
    await expect(main.locator(".product-quantity").first()).toHaveAttribute("aria-busy", "false");
  }
  await page.goto("/checkout");
  await expect(page.getByRole("group", { name: "Delivery time" })).toBeVisible();
  const total = await page.locator(".slot-day").count();
  expect(total).toBeGreaterThanOrEqual(4);
  // two days to start with; the rest wait behind one button
  await expect(page.locator(".slot-day:visible")).toHaveCount(2);
  const more = page.getByRole("button", { name: `Show more times (${total - 2} more days)` });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const monday = page.getByRole("radio", { name: "Mon, 5 Jan · 4:00 PM – 7:00 PM" });
  await expect(monday).toBeHidden();
  await shot(page, "checkout-times-folded");
  await more.click();
  await expect(page.locator(".slot-day:visible")).toHaveCount(total);
  // short on the button; the full time is what's read out
  await expect(page.locator(".slot-option", { has: monday })).toContainText("4 PM – 7 PM");
  await monday.check();
  await page.getByRole("button", { name: "Show fewer times" }).click();
  // folding again keeps the chosen time's day in sight
  await expect(monday).toBeVisible();
  await expect(monday).toBeChecked();
  await expect(page.locator(".slot-day:visible")).toHaveCount(3);
  const left = total - 3;
  await expect(page.getByRole("button", { name: `Show more times (${left} more ${left === 1 ? "day" : "days"})` })).toBeVisible();
  await shot(page, "checkout-times-chosen");
  await page.context().close();
  for (const area of before) await ServiceArea.updateOne({ _id: area._id }, { $set: { enabled: area.enabled, pincodes: area.pincodes } });
});

test("staff: a packing slip and the bill from the order page", async ({ browser }, info) => {
  // the shop's name on both comes from Store settings → Business and tax details
  await SystemSetting.updateOne(
    { key: "tax-details" },
    { $set: { value: { legalName: "Agarwal Online Test Shop", address: "Main Road, Nagothane", stateCode: "27", phone: "9876543210" } } },
    { upsert: true },
  );
  const page = await signedIn(browser, "owner", info.project.use);
  await page.goto(`/admin/orders/${order.id}`);
  await page.locator("main").getByRole("link", { name: "Packing slip" }).click();
  await expect(page).toHaveURL(`/admin/orders/${order.id}/slip`);
  const slip = page.locator("article.packing-slip");
  await expect(slip.getByRole("heading", { level: 1 })).toHaveText(order.number);
  await expect(slip.locator(".slip-shop")).toHaveText("Agarwal Online Test Shop · Packing slip");
  await expect(slip.getByRole("heading", { name: "Deliver to" })).toBeVisible();
  await expect(slip.locator(".slip-lines tbody tr")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print packing slip" })).toBeVisible();
  // the order's bills, each with Print bill and Share PDF on WhatsApp, above the slip and never printed
  const bills = page.locator(".slip-actions #bills > li");
  await expect(bills).not.toHaveCount(0);
  await expect(bills.first().getByRole("button", { name: /^Print (kaccha )?bill$/ })).toBeVisible();
  await expect(bills.first().getByRole("button", { name: /^Share (PDF on WhatsApp|kaccha bill)$/ })).toBeVisible();
  const bill = await (await page.request.get(`/api/invoices/${order.id}`)).text();
  expect(bill).toContain("<h1>Agarwal Online Test Shop</h1>");
  expect(bill).toContain("Main Road, Nagothane · Phone 9876543210");
  await SystemSetting.deleteOne({ key: "tax-details" });
  await shot(page, "packing-slip");
  // the printed page is the slip alone
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".slip-actions").first()).toBeHidden();
  await expect(page.locator("header.staff-header")).toBeHidden();
  await page.context().close();
});

test("owner: Settings changes the bill and the shop front", async ({ browser }, info) => {
  await SystemSetting.deleteMany({ key: /^shop-/ });
  const page = await signedIn(browser, "owner", info.project.use);
  // Settings shows one section at a time: a link to one opens it, and the old Customize address leads there
  await page.goto("/super-admin/customize#bill");
  await expect(page).toHaveURL("/super-admin#bill");
  const bill = page.locator("#bill");
  await bill.getByLabel("Terms").fill("Exchange within 7 days with the bill.");
  await bill.getByLabel("Paper size").selectOption("receipt");
  await bill.getByRole("button", { name: "Save bill settings" }).click();
  await expect(bill.getByText("Bill settings saved.")).toBeVisible();
  const html = await (await page.request.get(`/api/invoices/${order.id}`)).text();
  expect(html).toContain("Exchange within 7 days with the bill.");
  expect(html).toContain("size:80mm auto");
  await page.goto("/super-admin#storefront");
  const front = page.locator("#storefront");
  await front.getByLabel("Show an announcement bar at the top of every shop page").check();
  // one box per wording since the site went English only
  await front.getByRole("textbox", { name: /^Announcement For example/ }).fill("Closed on 1 November for Diwali");
  await front.getByRole("button", { name: "Save shop front" }).click();
  await expect(front.getByText("Shop front saved.")).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".announcement-bar")).toHaveText("Closed on 1 November for Diwali");
  await shot(page, "announcement");
  // the colour theme: the shop's own yellow header until an owner picks another, then every page follows at once
  const band = () => page.locator("header.shop-header").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await band()).toBe("rgb(255, 212, 59)");
  // from the list of settings, the way an owner gets there
  await page.goto("/super-admin");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: /^Shop front and colours/ }).click();
  await expect(page).toHaveURL("/super-admin#storefront");
  await front.getByLabel("Colour theme").selectOption({ label: "School bus: navy header, amber buttons" });
  await front.getByRole("button", { name: "Save shop front" }).click();
  await expect(front.getByText("Shop front saved.")).toBeVisible();
  await page.goto("/");
  expect(await band()).toBe("rgb(30, 58, 138)");
  // words on the navy band turn white, the strip's links included
  expect(await page.locator(".shop-strip .top-strip-links > a").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
  // amber buttons carry dark words in this theme
  const add = page.locator("main .add-button:not(:disabled)").first();
  expect(await add.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(["rgb(251, 191, 36)", "rgb(27, 27, 31)"]);
  await shot(page, "theme-school-bus");
  await SystemSetting.deleteMany({ key: /^shop-/ });
  await page.context().close();
});

test("staff: the name on the bill, a re-issue, and the estimate (kaccha bill)", async ({ browser }, info) => {
  const before = (await Order.findById(order.id).lean<{ deliveryStatus: string }>())!;
  // an order on its way, so its bill isn't given yet
  await Order.updateOne({ _id: order.id }, { $set: { deliveryStatus: "assigned" }, $unset: { bill: "" } });
  const page = await signedIn(browser, "owner", info.project.use);
  await page.goto(`/admin/orders/${order.id}`);
  const card = page.locator("#bill");
  const base = order.number.replace(/^[A-Z]+-/, "");
  // the shop has no GSTIN, so there's no buyer's GSTIN to give either: it's a cash memo, made out as asked
  await expect(card.getByLabel(/^Buyer.s GSTIN/)).toHaveCount(0);
  await card.getByLabel(/^Name on the bill/).fill("Patil Traders");
  await card.getByRole("button", { name: "Save bill details" }).click();
  await expect(card.getByText("Bill details saved.")).toBeVisible();
  const bill = await (await page.request.get(`/api/invoices/${order.id}`)).text();
  expect(bill).toContain("Patil Traders");
  expect(bill).toContain(base);
  expect(bill.toLowerCase()).toContain("cash memo");
  expect(bill).toContain("Not registered under GST");
  // before delivery the kaccha bill is an estimate, and it says it isn't a bill; it prints and shares like a bill
  const kaccha = card.locator("#bills > li", { hasText: "Kaccha bill" });
  await expect(kaccha.getByRole("button", { name: "Print kaccha bill" })).toBeVisible();
  await expect(kaccha.getByRole("button", { name: "Share kaccha bill" })).toBeVisible();
  const estimate = await (await page.request.get(`/api/invoices/${order.id}?kind=estimate`)).text();
  expect(estimate).toContain(`EST-${order.number}`);
  expect(estimate.toLowerCase()).toContain("not a tax invoice");
  // delivered: the bill is given, so a new name re-issues it under a new number, and there's no estimate any more
  await Order.updateOne({ _id: order.id }, { $set: { deliveryStatus: "delivered", "bill.issuedAt": new Date() } });
  await page.reload();
  await expect(page.locator("#bills > li", { hasText: "Kaccha bill" })).toHaveCount(0);
  await page.locator("#bill").getByLabel(/^Name on the bill/).fill("Patil Traders Pvt Ltd");
  await page.locator("#bill").getByRole("button", { name: "Save bill details" }).click();
  await expect(page.locator("#bill").getByText(/re-issued as bill/)).toBeVisible();
  const revised = await (await page.request.get(`/api/invoices/${order.id}`)).text();
  expect(revised).toContain(`${base}R1`);
  expect(revised).toContain("replaces");
  expect((await page.request.get(`/api/invoices/${order.id}?kind=estimate`)).status()).toBe(409);
  await Order.updateOne({ _id: order.id }, { $set: { deliveryStatus: before.deliveryStatus }, $unset: { bill: "" } });
  await page.context().close();
});

test("staff: a category first, then a subcategory inside it", async ({ browser }, info) => {
  const page = await signedIn(browser, "owner", info.project.use);
  await page.goto("/admin/categories");
  const main = page.locator("main");
  const addCategory = main.locator("details", { hasText: "Add a category" });
  await addCategory.locator("summary").click();
  await addCategory.getByLabel("Name", { exact: true }).fill("Festival");
  await addCategory.getByLabel(/^Web address/).fill("festival");
  await addCategory.getByRole("button", { name: "Add category" }).click();
  await expect(addCategory.getByText("Saved.")).toBeVisible();
  const addSub = main.locator("details", { hasText: "Add a subcategory" });
  await addSub.locator("summary").click();
  await addSub.getByLabel("Name", { exact: true }).fill("Rangoli");
  await addSub.getByLabel(/^Web address/).fill("rangoli");
  // a subcategory has to say which category it sits in; what was typed stays
  await addSub.getByRole("button", { name: "Add subcategory" }).click();
  await expect(addSub.getByText("Tick the category it sits in.")).toBeVisible();
  await expect(addSub.getByLabel("Name", { exact: true })).toHaveValue("Rangoli");
  await addSub.getByLabel("Festival", { exact: true }).check();
  await addSub.getByRole("button", { name: "Add subcategory" }).click();
  await expect(addSub.getByText("Saved.")).toBeVisible();
  // the list shows it one step in, under its category
  await page.goto("/admin/categories?q=rangoli");
  await expect(main.locator(".subcat", { hasText: "Rangoli" })).toBeVisible();
  await expect(main).toContainText("Festival");
  await shot(page, "categories");
  await Category.deleteMany({ slug: { $in: ["festival", "rangoli"] } });
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
  // an owner's sheet also carries the alert level and the purchase price, to change in bulk
  expect((await sheet.text()).split("\r\n")[0]).toBe("sku,product,pack,on_shelf,count,change,reason,alert_below,purchase_price");

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
