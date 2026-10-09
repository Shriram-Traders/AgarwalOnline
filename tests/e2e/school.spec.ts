// A school's whole quotation round trip, at desktop and phone width: a school-only item stays
// out of the shop; a representative joins through the school's link and the owner approves;
// the representative shops the school marketplace like the shop, and checkout creates a quotation
// for 500 instead of taking payment; the owner prices it with GST and sends it; the school asks
// for changes, gets version 2 and accepts it; anyone with the quotation's view-only link can read
// and print it until the owner makes a new link; and another school's representative can't look.
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Category, Product, ProductVariant, InventoryItem } from "../../src/lib/db/models";
import { QuoteRequest, School, SchoolMember } from "../../src/lib/schools/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const TOKEN = "e2e-school-join-token-01";
const NOT_FOUND = "We couldn’t find that page.";
const PEOPLE = {
  owner: { name: "E2E Owner", email: "school-owner@e2e.test", phone: "9000000121", roles: ["customer", "super-admin"] },
  rep: { name: "Asha Patil", email: "school-rep@e2e.test", phone: "9000000122", roles: ["customer"] },
  other: { name: "Other Rep", email: "other-rep@e2e.test", phone: "9000000123", roles: ["customer"] },
};
type Who = keyof typeof PEOPLE;
const out = process.env.SHOT_DIR;
let schoolId = "";
let quoteId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [owner, , other] = await User.create(
    Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })),
  );
  const category = await Category.create({ slug: "paper", name: { en: "Notebooks & Paper", mr: "वह्या व कागद" } });
  const product = await Product.create({
    slug: "e2e-attendance-register",
    name: { en: "E2E Attendance Register", mr: "हजेरी रजिस्टर" },
    description: { en: "Fictional register for schools", mr: "प्रात्यक्षिक रजिस्टर" },
    brand: "SCHOOLMATE",
    categoryId: category._id,
    categorySlug: "paper",
    status: "published",
    showToCustomers: false,
    showToSchools: true,
    gstRatePercent: 18,
    hsnCode: "4820",
  });
  const pack = await ProductVariant.create({
    productId: product._id,
    sku: "E2E-SCHOOL-1",
    label: "200 pages",
    unit: "piece",
    packQuantity: 1,
    pricePaise: 18900,
    mrpPaise: 22000,
    schoolPricePaise: 4250,
  });
  await InventoryItem.create({ variantId: pack._id, onHand: 0 });
  const [school, otherSchool] = await School.create([
    { name: "E2E Vidya Mandir", stateCode: "27", joinToken: TOKEN, createdBy: owner._id },
    { name: "E2E Other School", stateCode: "27", joinToken: "e2e-other-join-token-001", createdBy: owner._id },
  ]);
  schoolId = String(school._id);
  await SchoolMember.create({ schoolId: otherSchool._id, userId: other._id, addedBy: owner._id, via: "owner" });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const pages = new Map<Who, Page>();
async function as(who: Who, browser: Browser, info: TestInfo): Promise<Page> {
  const open = pages.get(who);
  if (open && !open.isClosed()) return open;
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  if (who !== "rep") await signIn(page, who);
  pages.set(who, page);
  return page;
}
async function signIn(page: Page, who: Who) {
  if (!page.url().includes("/login")) await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}
async function shot(page: Page, name: string) {
  if (!out) return;
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${out}/${test.info().project.name}_school-${name}.png`, fullPage: true });
}
test.afterAll(async () => {
  for (const page of pages.values()) await page.context().close();
  pages.clear();
});

test("a school-only item never shows in the shop", async ({ page }) => {
  // pages stream, so "not found" arrives as the not-found page rather than a 404 status
  await page.goto("/products/e2e-attendance-register");
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await page.goto("/catalog?q=attendance");
  await expect(page.getByRole("heading", { name: "No products found" })).toBeVisible();
});

test("a representative joins through the link and the owner approves", async ({ browser }, info) => {
  const rep = await as("rep", browser, info);
  await rep.goto(`/school/join/${TOKEN}`);
  await expect(rep.getByRole("heading", { name: "E2E Vidya Mandir" })).toBeVisible();
  await rep.locator("main").getByRole("link", { name: "Sign in", exact: true }).click();
  await rep.waitForURL((url) => url.pathname === "/login" && url.searchParams.has("then"));
  await signIn(rep, "rep");
  // sign-in comes straight back to the school's link
  await expect(rep).toHaveURL(`/school/join/${TOKEN}`);
  await rep.getByLabel("A line for the store").fill("Office in-charge");
  await rep.getByRole("button", { name: "Request access" }).click();
  await expect(rep.getByText("Request sent. The store will tell you when it’s approved.")).toBeVisible();

  const owner = await as("owner", browser, info);
  await owner.goto(`/super-admin/schools/${schoolId}`);
  // checks right after a page load look inside main: while a slow page streams in, a hidden
  // copy of it can sit at the end of the body for a moment
  await expect(owner.locator("main").getByText("Office in-charge")).toBeVisible();
  await owner.getByRole("button", { name: "Approve" }).click();
  // the request leaves the waiting list and the person joins the representatives
  await expect(owner.getByText("No one is waiting.")).toBeVisible();
  await expect(owner.getByRole("region", { name: "Representatives" }).getByText("Asha Patil")).toBeVisible();
  await shot(owner, "owner-school");
});

test("the representative shops the school marketplace and creates a quotation at checkout", async ({ browser }, info) => {
  const rep = await as("rep", browser, info);
  // the shop shows a representative the way in: a pill in the aisle row, or the phone's top strip
  await rep.goto("/");
  await rep.getByRole("link", { name: "For my school" }).first().click();
  await expect(rep).toHaveURL("/school");
  await expect(rep.getByRole("heading", { name: /Everything your school needs/ })).toBeVisible();
  await shot(rep, "home");
  await rep.getByRole("link", { name: "Browse school items" }).click();
  await expect(rep).toHaveURL("/school/catalog");
  const card = rep.locator(".school-card", { hasText: "E2E Attendance Register" });
  await expect(card.locator(".school-price")).toContainText("₹42.50");
  await expect(card.locator(".school-price")).toContainText("+ GST (18%)");
  await shot(rep, "catalogue");

  // the bulk list: type a quantity and add; the choice of list is remembered
  await rep.getByRole("link", { name: "List" }).click();
  await expect(rep.getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "true");
  const row = rep.locator(".school-row", { hasText: "E2E Attendance Register" });
  await row.getByLabel("How many of E2E Attendance Register").fill("500");
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(row.getByText("Added. The basket now has 500 of this.")).toBeVisible();
  await shot(rep, "list");
  await rep.goto("/school/catalog");
  await expect(rep.locator(".school-row").first()).toBeVisible();

  // its own page, like the shop's product page
  await rep.locator(".school-row-item", { hasText: "E2E Attendance Register" }).click();
  await expect(rep.getByRole("heading", { name: "E2E Attendance Register", level: 1 })).toBeVisible();
  await expect(rep.getByText("500 already in the basket")).toBeVisible();

  // the basket shows what to expect, then checkout asks for a quotation instead of payment
  await rep.goto("/school/basket");
  await expect(rep.getByLabel("Quantity of E2E Attendance Register")).toHaveValue("500");
  await expect(rep.locator(".basket-bill")).toContainText("₹21,250.00");
  await expect(rep.locator(".basket-bill")).toContainText("₹25,075.00");
  await shot(rep, "basket");
  await rep.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(rep).toHaveURL("/school/checkout");
  await expect(rep.locator(".school-billing")).toContainText("E2E Vidya Mandir");
  await rep.getByLabel("Anything the store should know").fill("Deliver to the school office");
  await shot(rep, "checkout");
  await rep.getByRole("button", { name: "Create quotation" }).click();
  await expect(rep).toHaveURL(/\/school\/quotations\/[a-f\d]{24}\?sent=1/);
  await expect(rep.getByText(/Sent to the store as AGSQ-\d{8}-\d{5}/)).toBeVisible();
  quoteId = rep.url().match(/quotations\/([a-f\d]{24})/)![1];
});

test("the owner prices it with GST and sends it", async ({ browser }, info) => {
  const owner = await as("owner", browser, info);
  await owner.goto("/super-admin/quotations");
  await owner.getByRole("link", { name: /AGSQ-/ }).first().click();
  await expect(owner).toHaveURL(`/super-admin/quotations/${quoteId}`);
  // the line starts at the school price, with the product's GST rate
  await expect(owner.getByLabel("Rate before GST for E2E Attendance Register")).toHaveValue("42.50");
  await expect(owner.getByLabel("GST rate for E2E Attendance Register")).toHaveValue("18");
  await expect(owner.locator(".sheet-totals")).toContainText("₹25,075.00");
  await expect(owner.getByRole("button", { name: "Send quotation" })).toBeDisabled();
  await owner.getByRole("button", { name: "Save draft" }).click();
  await expect(owner.getByText("Draft saved. Check the totals, then send it.")).toBeVisible();
  await shot(owner, "desk");
  await owner.getByRole("button", { name: "Send quotation" }).click();
  await owner.getByRole("button", { name: "Yes, send quotation" }).click();
  await expect(owner.getByText("Version 1 sent (₹25,075.00 with GST)", { exact: false })).toBeVisible();
});

test("the school asks for changes, gets version 2 and accepts it", async ({ browser }, info) => {
  const rep = await as("rep", browser, info);
  await rep.goto(`/school/quotations/${quoteId}`);
  await expect(rep.locator("main .quotation")).toContainText("₹25,075.00");
  await expect(rep.locator("main .quotation")).toContainText("CGST");
  await shot(rep, "quotation");
  await rep.getByLabel("What should change?").fill("Can you do ₹40 if we take 500?");
  await rep.getByRole("button", { name: "Ask for changes" }).click();
  // the answer panel gives way to where things stand
  await expect(rep.getByText("You asked for changes. The store will send a revised quotation.")).toBeVisible();

  const owner = await as("owner", browser, info);
  await owner.goto(`/super-admin/quotations/${quoteId}`);
  await expect(owner.locator("main .quote-changes")).toContainText("Can you do ₹40 if we take 500?");
  await owner.getByLabel("Rate before GST for E2E Attendance Register").fill("40");
  // sending waits while the sheet has unsaved changes
  await expect(owner.getByRole("button", { name: "Send quotation" })).toBeDisabled();
  await owner.getByRole("button", { name: "Save draft" }).click();
  await expect(owner.getByText("Draft saved. Check the totals, then send it.")).toBeVisible();
  await owner.getByRole("button", { name: "Send quotation" }).click();
  await owner.getByRole("button", { name: "Yes, send quotation" }).click();
  await expect(owner.getByText("Version 2 sent (₹23,600.00 with GST)", { exact: false })).toBeVisible();

  await rep.goto(`/school/quotations/${quoteId}`);
  await expect(rep.getByRole("link", { name: "Version 2 (latest)" })).toBeVisible();
  await expect(rep.locator("main .quotation")).toContainText("₹23,600.00");
  await rep.getByRole("button", { name: "Accept quotation" }).click();
  await rep.getByRole("button", { name: "Yes, accept quotation" }).click();
  await expect(rep.getByText("Your school accepted version 2 (₹23,600.00 with GST).", { exact: false })).toBeVisible();
  expect((await QuoteRequest.findById(quoteId))?.status).toBe("accepted");
});

test("anyone with the quotation's link can see and print it, and a new link stops the old one", async ({ browser, page }, info) => {
  const rep = await as("rep", browser, info);
  await rep.goto(`/school/quotations/${quoteId}`);
  const link = await rep.getByLabel("View-only link").inputValue();
  const code = link.match(/\/q\/([A-Za-z0-9_-]{24})$/)![1];
  expect(code).toBe((await QuoteRequest.findById(quoteId))?.shareToken);

  // signed out: the latest version to read and print, and no way to answer or see the school's notes
  await page.goto(`/q/${code}`);
  await expect(page.locator("main .quotation")).toContainText("₹23,600.00");
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept quotation" })).toHaveCount(0);
  await expect(page.getByText("Can you do ₹40 if we take 500?")).toHaveCount(0);
  await expect(page.getByText("Deliver to the school office")).toHaveCount(0);
  await shot(page, "shared-link");

  const owner = await as("owner", browser, info);
  await owner.goto(`/super-admin/quotations/${quoteId}`);
  await expect(owner.getByLabel("View-only link")).toHaveValue(link);
  await owner.getByRole("button", { name: "Make a new link" }).click();
  await owner.getByRole("button", { name: "Yes, make a new link" }).click();
  await expect(owner.getByText("A new link is ready. The old one no longer works.")).toBeVisible();
  await expect(owner.getByLabel("View-only link")).not.toHaveValue(link);

  await page.goto(`/q/${code}`);
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await expect(page.getByText("E2E Attendance Register")).toHaveCount(0);
  const fresh = (await QuoteRequest.findById(quoteId))?.shareToken;
  await page.goto(`/q/${fresh}`);
  await expect(page.locator("main .quotation")).toContainText("₹23,600.00");
});

test("another school's representative finds nothing there", async ({ browser }, info) => {
  const other = await as("other", browser, info);
  await other.goto(`/school/quotations/${quoteId}`);
  await expect(other.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await expect(other.getByText("E2E Attendance Register")).toHaveCount(0);
  await other.goto(`/school?s=${schoolId}`);
  await expect(other.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await other.goto("/school");
  await expect(other.locator("main").getByText("E2E Other School").first()).toBeVisible();
  await expect(other.getByText("E2E Vidya Mandir")).toHaveCount(0);
});

test("the owner shops for any school and creates its quotation", async ({ browser }, info) => {
  const owner = await as("owner", browser, info);
  await owner.goto("/");
  // the owner represents no school, but gets the way in by default
  await owner.getByRole("link", { name: "For schools" }).first().click();
  await expect(owner).toHaveURL("/school");
  await expect(owner.getByRole("heading", { name: "Choose your school" })).toBeVisible();
  await owner.getByRole("link", { name: "E2E Vidya Mandir" }).click();
  await expect(owner.getByText("Shopping for E2E Vidya Mandir as the owner")).toBeVisible();
  await owner.goto("/school/catalog?view=cards");
  const card = owner.locator(".school-card", { hasText: "E2E Attendance Register" });
  await card.getByLabel("How many of E2E Attendance Register").fill("40");
  await card.getByRole("button", { name: "Add to basket" }).click();
  await expect(card.getByText("Added. The basket now has 40 of this.")).toBeVisible();
  await owner.goto("/school/checkout");
  await owner.getByRole("button", { name: "Create quotation" }).click();
  await expect(owner).toHaveURL(/\/school\/quotations\/[a-f\d]{24}\?sent=1/);
  // it lands on the owner's desk like any school's request
  await expect(owner.getByRole("link", { name: "Quotation desk" })).toBeVisible();
  expect(await QuoteRequest.countDocuments({ schoolId })).toBe(2);
});
