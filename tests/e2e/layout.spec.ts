// Every page, at both widths. The route list is read from src/app, so a page
// added later is checked on desktop (chromium project) and phone (mobile
// project) without anyone remembering to add it here. A new dynamic segment
// fails loudly until it gets a sample below.
//
// Set SHOT_DIR to also write a full-page screenshot of every route.
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Product, ProductVariant } from "../../src/lib/db/models";
import { ShoppingList } from "../../src/lib/lists/models";
import { Address, Order } from "../../src/lib/commerce/models";
import { ChatConversation } from "../../src/lib/chat/models";
import { QuoteBasket, QuoteRequest, School } from "../../src/lib/schools/models";
import { istDatePlus, quoteTotals } from "../../src/lib/schools/quote-math";
import { DEFAULT_TAX_PROFILE } from "../../src/lib/tax/gst";
import { OrderFeedback } from "../../src/lib/feedback/models";
import { LEGAL_PAGES, POLICIES_HOME } from "../../src/lib/legal/pages";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const out = process.env.SHOT_DIR;
const PASSWORD = "Local-test-password-123";
const EMAILS = {
  customer: "customer@demo.ags.test",
  delivery: "delivery@demo.ags.test",
  owner: "super-admin@demo.ags.test",
};
type Who = keyof typeof EMAILS | "guest";

const routes = readdirSync("src/app", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith("page.tsx"))
  .map((file) => "/" + file.replace(/\\/g, "/").replace(/\/?page\.tsx$/, ""))
  .sort();

function whoFor(route: string): Who {
  if (route.startsWith("/admin") || route.startsWith("/super-admin")) return "owner";
  if (route.startsWith("/delivery")) return "delivery";
  // the demo customer represents the seeded school
  if (route.startsWith("/account") || route === "/checkout" || route.startsWith("/school")) return "customer";
  return "guest";
}

const samples: Record<string, string> = {};

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // the fictional demo catalog: 41 products, 8 orders, promotions, staff
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
    // on Windows npx is a .cmd script, which Node only starts through a shell (else: spawnSync npx ENOENT)
    shell: process.platform === "win32",
  });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  // the seed hands its demo orders to whichever user it finds first; give them to the plain customer
  const customer = await User.findOneAndUpdate(
    { roles: ["customer"] },
    { email: EMAILS.customer, passwordHash },
    { returnDocument: "after" },
  );
  await User.updateMany({ email: { $in: [EMAILS.delivery, EMAILS.owner] } }, { passwordHash });
  await Order.updateMany({}, { customerId: customer!._id });
  await Address.updateMany({}, { customerId: customer!._id });
  // every page is checked as it is, without the "How did we do?" popup over it: the demo
  // customer has already said "Not now" about each delivery the seed didn't rate
  const rated = await OrderFeedback.distinct("orderId");
  for (const unrated of await Order.find({ deliveryStatus: "delivered", _id: { $nin: rated } }).select("number"))
    await OrderFeedback.create({ orderId: unrated._id, orderNumber: unrated.number, state: "skipped" });
  const order = await Order.findOne({ assignedTo: { $exists: true } });
  const chat = await ChatConversation.create({ customerId: customer!._id, title: "Where is my order?" });
  const product = (await Product.findOne({ status: "published", showToCustomers: { $ne: false } }))!;
  samples["/products/[slug]"] = `/products/${product.slug}`;
  samples["/admin/products/[id]"] = `/admin/products/${product._id}`;
  samples["/account/orders/[id]"] = `/account/orders/${order!._id}`;
  samples["/admin/orders/[id]"] = `/admin/orders/${order!._id}`;
  samples["/admin/orders/[id]/slip"] = `/admin/orders/${order!._id}/slip`;
  samples["/delivery/orders/[id]"] = `/delivery/orders/${order!._id}`;
  samples["/account/support/[id]"] = `/account/support/${chat._id}`;
  const firstPack = (await ProductVariant.findOne())!._id;
  const board = await ShoppingList.create({
    ownerId: customer!._id,
    kind: "board",
    name: "Diwali gifts",
    shareToken: "layout-share-token-00000",
    inviteToken: "layout-invite-token-0000",
    items: [{ variantId: firstPack, quantity: 2, addedBy: customer!._id }],
  });
  // a shared basket, so /cart shows its pills
  await ShoppingList.create({
    ownerId: customer!._id,
    kind: "basket",
    name: "School list",
    shareToken: "layout-basket-share-0000",
    inviteToken: "layout-basket-invite-000",
    items: [{ variantId: firstPack, quantity: 1, addedBy: customer!._id }],
  });
  samples["/account/lists/[id]"] = `/account/lists/${board._id}`;
  // a signed-out visitor on the invite link: the page with the most on it
  samples["/lists/[token]"] = `/lists/${board.inviteToken}`;
  samples["/admin/support/[id]"] = `/admin/support/${chat._id}`;
  // the school area: a basket with a line, and a quotation sent once, with a draft on the desk
  const owner = (await User.findOne({ email: EMAILS.owner }))!;
  const school = (await School.findOne({ name: "Fictional Vidya Mandir" }))!;
  const packs = await ProductVariant.find({ sku: /^AGS-S-/ }).sort({ sku: 1 });
  const schoolProducts = await Product.find({ _id: { $in: packs.map((pack) => pack.productId) } });
  await QuoteBasket.create({
    schoolId: school._id,
    items: [{ variantId: packs[0]._id, quantity: 120, addedBy: customer!._id }],
    rev: 1,
  });
  const items = packs.map((pack) => {
    const item = schoolProducts.find((entry) => String(entry._id) === String(pack.productId))!;
    return {
      variantId: pack._id,
      productId: item._id,
      name: item.name.en,
      label: pack.label,
      sku: pack.sku,
      quantity: 250,
      schoolPricePaise: pack.schoolPricePaise ?? undefined,
      shopPricePaise: pack.pricePaise,
      gstRatePercent: item.gstRatePercent ?? undefined,
      hsnCode: item.hsnCode ?? undefined,
      addedBy: customer!._id,
    };
  });
  const lines = items.map((item) => ({
    variantId: item.variantId,
    name: item.name,
    label: item.label,
    hsnCode: item.hsnCode,
    quantity: item.quantity,
    unitPricePaise: item.schoolPricePaise ?? 8000,
    gstRatePercent: item.gstRatePercent ?? 18,
  }));
  const totals = quoteTotals(lines, { type: "percent", percent: 5 }, "intra");
  const validUntil = istDatePlus(15);
  const quote = await QuoteRequest.create({
    number: "AGSQ-20261002-00001",
    shareToken: "layout-quote-token-00000",
    schoolId: school._id,
    requestedBy: customer!._id,
    note: "Deliver to the school office, please",
    neededBy: validUntil,
    status: "quoted",
    items,
    draft: {
      lines,
      discountType: "percent",
      discountValue: 5,
      validUntil,
      note: "Delivered in two lots",
      updatedBy: owner._id,
      updatedAt: new Date(),
      sentAsVersion: 1,
    },
    currentVersion: 1,
    versions: [
      {
        version: 1,
        sentAt: new Date(),
        sentBy: owner._id,
        validUntil,
        note: "Delivered in two lots",
        supply: "intra",
        seller: { name: DEFAULT_TAX_PROFILE.legalName, address: DEFAULT_TAX_PROFILE.address, stateCode: "27" },
        buyer: { name: school.name, address: school.address, pin: school.pin, stateCode: "27" },
        lines: lines.map((line, index) => ({ ...line, ...totals.lines[index] })),
        taxes: totals.taxes,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        discountLabel: "Discount (5%)",
        taxablePaise: totals.taxablePaise,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        igstPaise: totals.igstPaise,
        totalPaise: totals.totalPaise,
        emailed: { sent: 0, noEmail: 1, failed: 0 },
      },
    ],
  });
  samples["/school/join/[token]"] = `/school/join/${school.joinToken}`;
  samples["/school/quotations/[id]"] = `/school/quotations/${quote._id}`;
  samples["/school/[...missing]"] = "/school/no-such-page";
  // a school-only item's own page in the school marketplace
  samples["/school/products/[slug]"] = `/school/products/${schoolProducts.find((p) => p.showToCustomers === false)?.slug ?? schoolProducts[0].slug}`;
  samples["/super-admin/quotations/[id]"] = `/super-admin/quotations/${quote._id}`;
  // the quotation's view-only link, opened signed out
  samples["/q/[code]"] = `/q/${quote.shareToken}`;
  samples["/super-admin/schools/[id]"] = `/super-admin/schools/${school._id}`;
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, who: Who, use: TestInfo["project"]["use"]): Promise<Page> {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = use;
  const page = await (
    await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
  ).newPage();
  if (who === "guest") return page;
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(EMAILS[who]);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

/** Things that break a layout at any width; each entry names the offender. */
function layoutProblems() {
  const width = document.documentElement.clientWidth;
  const problems: string[] = [];
  const name = (el: Element) => {
    const label = el.getAttribute("aria-label") ?? el.getAttribute("name");
    return `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}${label ? `[${label}]` : ""}`;
  };
  const clipped = (el: Element | null): boolean => {
    for (; el && el !== document.body; el = el.parentElement)
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowX)) return true;
    return false;
  };
  if (document.documentElement.scrollWidth > width)
    problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px wide in ${width}px`);
  for (const el of document.body.querySelectorAll("*")) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(el).visibility === "hidden") continue;
    if (el.closest(".sr-only, .skip-link")) continue;
    // content poking past the edge outside any scroller or clip
    if ((box.right > width + 1 || box.left < -1) && !clipped(el.parentElement))
      problems.push(`${name(el)} runs off the ${box.left < -1 ? "left" : "right"} edge`);
    // WCAG 2.2 target size (minimum): 24px; links inside running text are exempt
    if (
      el.matches(
        "button, select, summary, input:not([type=hidden], [type=checkbox], [type=radio]), a:not(:is(p, li, td, small, label) a)",
      ) &&
      box.height < 24
    )
      problems.push(`${name(el)} is a ${Math.round(box.height)}px tap target`);
  }
  return [...new Set(problems)].slice(0, 8);
}

test("every page holds its layout", async ({ browser }, info) => {
  test.setTimeout(20 * 60_000); // a cold dev server compiles all 40 pages
  const pages = new Map<Who, Page>();
  const report: Record<string, string[]> = {};
  for (const route of routes) {
    const path = route.includes("[") ? samples[route] : route;
    if (!path) {
      report[route] = ["dynamic segment without a sample: add one in layout.spec.ts"];
      continue;
    }
    const who = whoFor(route);
    if (!pages.has(who)) pages.set(who, await signedIn(browser, who, info.project.use));
    const page = pages.get(who)!;
    const response = await page.goto(path);
    // support chat polls for messages and never goes idle
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    // a redirect that arrives just after "load" (/staff/login → /login on a slow server) restarts the
    // page under the measurement: measure the page it settled on
    const problems = await page.evaluate(layoutProblems).catch(async () => {
      await page.waitForLoadState("load");
      return page.evaluate(layoutProblems);
    });
    if ((response?.status() ?? 0) >= 500) problems.unshift(`answered ${response?.status()}`);
    if (problems.length) report[path] = problems;
    if (out)
      await page.screenshot({
        path: `${out}/${info.project.name}${route.replace(/[/[\]]+/g, "_") || "_home"}.png`,
        fullPage: true,
      });
  }
  // the policies come in full Marathi too: longer words, same layout rules
  const marathi = await signedIn(browser, "guest", info.project.use);
  await marathi.context().addCookies([{ name: "ags_locale", value: "mr", url: info.project.use.baseURL! }]);
  for (const policy of [POLICIES_HOME, ...LEGAL_PAGES]) {
    await marathi.goto(policy.href);
    await marathi.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const problems = await marathi.evaluate(layoutProblems);
    if (problems.length) report[`${policy.href} (mr)`] = problems;
    if (out)
      await marathi.screenshot({
        path: `${out}/${info.project.name}${policy.href.replace(/\//g, "_")}_mr.png`,
        fullPage: true,
      });
  }
  expect(report).toEqual({});
});
