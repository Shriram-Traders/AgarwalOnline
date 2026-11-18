// Pack settings at desktop and phone width: settings rows that open one at a time, the Add and
// Remove stock dialog, deleting a pack or product as an owner and asking as staff, and the Stock
// page's rows, which stay on one card with their three counts side by side on phones.
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { ApprovalRequest } from "../../src/lib/governance/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Pack Owner", email: "pack-owner@e2e.test", phone: "9000000421" };
const STAFF = { name: "Pack Staff", email: "pack-staff@e2e.test", phone: "9000000422" };
const out = process.env.SHOT_DIR;

test.describe.configure({ mode: "serial" });

let categoryId: unknown;
const reset = async () => {
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create([
    { ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash },
    { ...STAFF, roles: ["customer", "admin"], emailVerified: true, passwordHash },
  ]);
  categoryId = (await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } }))._id;
};
/** A live product with a pack of each given size, each with its own stock. */
async function product(slug: string, packs: [label: string, onHand: number, reserved?: number][]) {
  const made = await Product.create({
    slug,
    name: { en: `${slug} book`, mr: "वही" },
    description: { en: "A notebook for testing", mr: "चाचणीसाठी वही" },
    categoryId,
    categorySlug: "paper",
    status: "published",
  });
  const ids: string[] = [];
  for (const [index, [label, onHand, reserved = 0]] of packs.entries()) {
    const pack = await ProductVariant.create({
      productId: made._id,
      sku: `${slug}-${index}`.toUpperCase(),
      label,
      unit: "piece",
      packQuantity: 1,
      pricePaise: 1000,
      mrpPaise: 2000,
    });
    await InventoryItem.create({ variantId: pack._id, onHand, reserved });
    ids.push(String(pack._id));
  }
  return { id: String(made._id), packs: ids };
}
const onShelf = async (variantId: string) => (await InventoryItem.findOne({ variantId })).onHand as number;

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await reset();
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, page: Page, who: { email: string }) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
    isMobile: test.info().project.name === "mobile",
    reducedMotion: "reduce",
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
async function shot(where: Page | Locator, name: string) {
  if (out) await where.screenshot({ path: `${out}/${test.info().project.name}_packs-${name}.png` });
}

test("each setting is a row with its value, and rows open one at a time", async ({ browser, page }) => {
  const made = await product("rows", [["100 pages", 30]]);
  await ProductVariant.updateOne({ _id: made.packs[0] }, { costPaise: 900, schoolPricePaise: 1500 });
  const owner = await signedIn(browser, page, OWNER);
  await owner.goto(`/admin/products/${made.id}`);
  const card = owner.locator(`[id="pack-${made.packs[0]}"]:visible`);
  await expect(card.locator("summary", { hasText: "Selling price" })).toContainText("₹10, MRP ₹20");
  await expect(card.locator("summary", { hasText: "Purchase price" })).toContainText("₹9, ₹1 profit");
  await expect(card.locator("summary", { hasText: "School price" })).toContainText("₹15 + GST");
  await expect(card.locator("summary", { hasText: "Stock alert" })).toContainText("below 10");
  await expect(card.locator("summary", { hasText: "Name and limit" })).toContainText("10 per order");
  await expect(card.getByRole("button", { name: "Delete this pack" })).toBeVisible();
  await shot(card, "card");

  await card.locator("summary", { hasText: "Selling price" }).click();
  await expect(card.getByRole("button", { name: "Change price" })).toBeVisible();
  await card.locator("summary", { hasText: "Stock alert" }).click();
  await expect(card.getByRole("button", { name: "Save alert" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Change price" })).toBeHidden();

  // nothing is underlined any more, and the one bottom line under the add button is a dashed border
  for (const link of [card.locator("summary", { hasText: "Stock alert" }), card.getByRole("link", { name: "Add stock of 100 pages" })])
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");
  await expect(owner.getByRole("link", { name: "Add another pack size" })).toBeVisible();

  // a setting still saves: price from the row, and the row shows the new value
  await card.locator("summary", { hasText: "Selling price" }).click();
  await card.getByLabel("Selling price (₹)").fill("12");
  await card.getByRole("button", { name: "Change price" }).click();
  await expect(card.locator("summary", { hasText: "Selling price" })).toContainText("₹12, MRP ₹20");
});

test("the dialog adds and removes stock, with no minus sign to type", async ({ browser, page }) => {
  const made = await product("dialog", [["100 pages", 30, 2]]);
  const [pack] = made.packs;
  const owner = await signedIn(browser, page, OWNER);
  await owner.goto(`/admin/products/${made.id}`);
  const card = owner.locator(`[id="pack-${pack}"]:visible`);
  await expect(card).toContainText("28 in stock");
  await expect(card).toContainText("2 held for orders");

  await card.getByRole("link", { name: "Remove stock of 100 pages" }).click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Remove stock" })).toBeVisible();
  await expect(dialog).toContainText("30 on the shelf · 2 held for orders");
  // on phones it sits at the bottom of the screen, on PC in the middle
  const box = (await dialog.boundingBox())!;
  const height = owner.viewportSize()!.height;
  if (test.info().project.name === "mobile") expect(box.y + box.height).toBeGreaterThanOrEqual(height - 2);
  else expect(box.y).toBeGreaterThan(0);
  await shot(owner, "remove-dialog");

  // only what isn't held can go
  await dialog.getByRole("button", { name: "All 28" }).click();
  await expect(dialog).toContainText("30 on the shelf → 2");
  await dialog.getByRole("textbox", { name: "How many" }).fill("29");
  await expect(dialog.getByRole("alert")).toContainText("Only 28 can be removed: 2 are held for open orders");
  await expect(dialog.getByRole("button", { name: "Remove 29 from stock" })).toBeDisabled();

  await dialog.getByRole("textbox", { name: "How many" }).fill("5");
  await dialog.getByRole("radio", { name: "Damaged" }).check({ force: true });
  await dialog.getByRole("button", { name: "Remove 5 from stock" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stock updated.");
  await expect.poll(() => onShelf(pack)).toBe(25);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();
  await expect(owner).toHaveURL(new RegExp(`/admin/products/${made.id}$`));
  await expect(card).toContainText("23 in stock");

  await card.getByRole("link", { name: "Add stock of 100 pages" }).click();
  await expect(dialog.getByRole("heading", { name: "Add stock" })).toBeVisible();
  await dialog.getByRole("button", { name: "One more" }).click();
  await dialog.getByRole("radio", { name: "Other" }).check({ force: true });
  await dialog.getByLabel(/^Say why/).fill("Found behind the shelf");
  await dialog.getByRole("button", { name: "Add 2 to stock" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stock updated.");
  await expect.poll(() => onShelf(pack)).toBe(27);
});

test("staff ask for the owner: a removal and a delete both wait, and the owner decides", async ({ browser, page }) => {
  const made = await product("ask", [["100 pages", 30], ["200 pages", 10]]);
  const [pack] = made.packs;
  const staff = await signedIn(browser, page, STAFF);
  await staff.goto(`/admin/products/${made.id}`);
  const card = staff.locator(`[id="pack-${pack}"]:visible`);
  // only owners see purchase and school prices
  await expect(card.locator("summary", { hasText: "Purchase price" })).toHaveCount(0);
  await expect(card.locator("summary", { hasText: "School price" })).toHaveCount(0);

  await card.getByRole("link", { name: "Remove stock of 100 pages" }).click();
  const dialog = staff.getByRole("dialog");
  await expect(dialog).toContainText("An owner approves this before the count changes.");
  await dialog.getByRole("radio", { name: "Expired" }).check({ force: true });
  await dialog.getByRole("button", { name: "Ask the owner to remove 1" }).click();
  await expect(dialog.getByRole("status")).toContainText("Sent to an owner");
  expect(await onShelf(pack)).toBe(30);
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(staff.locator(".waiting-requests")).toContainText("100 pages: stock -1");

  await card.locator("summary", { hasText: "Delete this pack" }).click();
  await card.getByLabel(/^Why should it go/).fill("Added by mistake");
  await card.getByRole("button", { name: "Ask the owner to delete" }).click();
  await expect(card.locator(".pack-setting-row")).toContainText("Waiting for owner");
  await expect(staff.locator(".waiting-requests")).toContainText("Delete the pack 100 pages");
  expect((await ProductVariant.findById(pack)).deletedAt).toBeUndefined();

  const owner = await signedIn(browser, page, OWNER);
  await owner.goto("/super-admin/approvals");
  await owner.getByRole("link", { name: "Delete pack: ask book · 100 pages" }).click();
  await expect(owner.getByLabel(/^Publish at/)).toHaveCount(0);
  await expect(owner.locator(".record-history")).toContainText("Added by mistake");
  await owner.getByRole("button", { name: "Record decision" }).click();
  await owner.getByRole("button", { name: "Yes, record decision" }).click();
  await expect.poll(async () => Boolean((await ProductVariant.findById(pack)).deletedAt)).toBe(true);
  // the waiting removal for it was taken back, and its stock went with it
  await expect.poll(() => ApprovalRequest.countDocuments({ kind: "stock", state: "pending" })).toBe(0);
  expect(await onShelf(pack)).toBe(0);

  await staff.goto(`/admin/products/${made.id}`);
  await expect(staff.locator(`[id="pack-${pack}"]:visible`)).toHaveCount(0);
  await expect(staff.locator(`[id="pack-${made.packs[1]}"]:visible`)).toBeVisible();
});

test("an owner deletes a pack after seeing what happens; held stock stops it", async ({ browser, page }) => {
  const made = await product("gone", [["100 pages", 30], ["200 pages", 10, 2]]);
  const owner = await signedIn(browser, page, OWNER);
  await owner.goto(`/admin/products/${made.id}`);
  const card = owner.locator(`[id="pack-${made.packs[0]}"]:visible`);
  await card.getByRole("button", { name: "Delete this pack" }).click();
  const confirm = owner.getByRole("alertdialog");
  await expect(confirm).toContainText("The 30 in stock are written off");
  await expect(confirm).toContainText("Past orders, bills and quotations stay as they are");
  if (test.info().project.name === "mobile") {
    const box = (await confirm.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThanOrEqual(owner.viewportSize()!.height - 2);
  }
  await shot(owner, "delete-confirm");
  await confirm.getByRole("button", { name: "No, go back" }).click();
  expect((await ProductVariant.findById(made.packs[0])).deletedAt).toBeUndefined();

  await card.getByRole("button", { name: "Delete this pack" }).click();
  await confirm.getByRole("button", { name: "Yes, delete this pack" }).click();
  await expect(card).toHaveCount(0);

  // the shop no longer offers it
  await owner.goto("/products/gone");
  await expect(owner.locator(".variant-list")).toContainText("200 pages");
  await expect(owner.locator(".variant-list")).not.toContainText("100 pages");

  // two are held for orders: it says so, and offers to hide the pack for now
  await owner.goto(`/admin/products/${made.id}`);
  const held = owner.locator(`[id="pack-${made.packs[1]}"]:visible`);
  const row = held.locator("summary", { hasText: "Delete this pack" });
  await expect(row).toContainText("2 held");
  await row.click();
  await expect(held.locator(".notice")).toContainText("2 are held for open orders");
  await shot(held, "delete-held");
  await held.getByRole("button", { name: "Hide it for now" }).click();
  await expect.poll(async () => (await ProductVariant.findById(made.packs[1])).active).toBe(false);
  await expect(held.locator("summary", { hasText: "On sale" })).toContainText("Hidden");
});

test("the Stock page has Remove, Add and a menu; on phones the counts sit side by side", async ({ browser, page }) => {
  await reset();
  const made = await product("sheet", [["100 pages", 30], ["200 pages", 8]]);
  const owner = await signedIn(browser, page, OWNER);
  await owner.goto("/admin/inventory");
  // the stock table, not Recent changes below it, which names packs too
  const stockRow = (label: string) => owner.locator(".stock-table").getByRole("row").filter({ hasText: label });
  const first = stockRow("100 pages");
  await expect(first.getByRole("link", { name: "Remove stock of sheet book 100 pages" })).toBeVisible();
  await expect(first.getByRole("link", { name: "Add stock of sheet book 100 pages" })).toBeVisible();
  const look = await first.getByRole("link", { name: "Add stock of sheet book 100 pages" }).evaluate((el) => getComputedStyle(el).textDecorationLine);
  expect(look).toBe("none");
  if (test.info().project.name === "mobile") {
    const y = async (label: string) => (await first.locator(`td[data-label="${label}"]`).boundingBox())!.y;
    expect(await y("Held for orders")).toBeCloseTo(await y("On the shelf"), 0);
    expect(await y("Can be sold")).toBeCloseTo(await y("On the shelf"), 0);
    const width = (await first.boundingBox())!.width;
    const button = (await first.getByRole("link", { name: "Add stock of sheet book 100 pages" }).boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeLessThan(width);
  }
  // a closed menu takes up no room, even on the table's last row
  expect(await stockRow("200 pages").locator(".pack-delete-form button").boundingBox()).toBeNull();
  await shot(first, "stock-row");
  await shot(owner.locator(".stock-table"), "stock-page");
  // every button fits inside the table, at both widths
  const table = (await owner.locator(".stock-table").boundingBox())!;
  const menu = (await first.getByLabel("More for sheet book 100 pages").boundingBox())!;
  expect(menu.x + menu.width).toBeLessThanOrEqual(table.x + table.width);

  await first.getByRole("link", { name: "Remove stock of sheet book 100 pages" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Count was wrong" }).check({ force: true });
  await dialog.getByRole("button", { name: "Remove 1 from stock" }).click();
  await expect(dialog.getByRole("status")).toContainText("Stock updated.");
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(first.locator('td[data-label="On the shelf"]')).toHaveText("29");
  // closing it leaves the page as it was: a filter like ?stock=low stays, the dialog doesn't come back
  await owner.goto("/admin/inventory?stock=low");
  await expect(stockRow("100 pages")).toHaveCount(0);
  await stockRow("200 pages").getByRole("link", { name: /^Add stock/ }).click();
  await expect(owner.getByRole("dialog").getByRole("heading", { name: "Add stock" })).toBeVisible();
  await expect(owner).toHaveURL(/stock=low/);
  await owner.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(owner.getByRole("dialog")).toBeHidden();
  await expect(owner).toHaveURL(/\/admin\/inventory\?stock=low$/);
  await owner.goto("/admin/inventory");

  await first.getByLabel("More for sheet book 100 pages").click();
  await first.getByRole("link", { name: "Stock alert" }).click();
  await expect(owner.locator("#alert")).toContainText("sheet book · 100 pages");
  await owner.locator("#alert").getByRole("link", { name: "Close" }).click();

  await first.getByLabel("More for sheet book 100 pages").click();
  await expect(first.getByRole("link", { name: "Edit product" })).toBeVisible();
  await shot(first, "stock-menu");
  await first.getByRole("button", { name: "Delete this pack" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Yes, delete this pack" }).click();
  await expect(stockRow("100 pages")).toHaveCount(0);
  await expect(stockRow("200 pages")).toBeVisible();
  // its removal stays in the history, under its product and pack name
  await expect(owner.locator(".data-table").last()).toContainText("sheet book · 100 pages");
  expect(await InventoryItem.countDocuments({ variantId: made.packs[0], onHand: 0 })).toBe(1);

  // the old address still opens the dialog
  await owner.goto(`/admin/inventory?adjust=${made.packs[1]}#adjust`);
  await expect(owner.getByRole("dialog").getByRole("heading", { name: "Add stock" })).toBeVisible();
});

test("an owner deletes a whole product; it leaves the shop and the lists", async ({ browser, page }) => {
  const made = await product("whole", [["100 pages", 30], ["200 pages", 12]]);
  const owner = await signedIn(browser, page, OWNER);
  await owner.goto(`/admin/products/${made.id}`);
  await owner.getByRole("button", { name: "Delete this product" }).click();
  const confirm = owner.getByRole("alertdialog");
  await expect(confirm).toContainText("Its 2 packs and the 42 in stock go with it");
  await confirm.getByRole("button", { name: "Yes, delete this product" }).click();
  await owner.waitForURL(/\/admin\/products\?deleted=1/);
  await expect(owner.getByRole("status").filter({ hasText: "Product deleted" })).toBeVisible();
  await expect(owner.locator("main")).not.toContainText("whole book");
  // the page streams, so the not-found page can arrive with a 200: check what's on it
  await owner.goto(`/admin/products/${made.id}`);
  await expect(owner.getByRole("heading", { name: "Packs and prices" })).toHaveCount(0);
  await expect(owner.locator("main")).not.toContainText("whole book");
  await owner.goto("/products/whole");
  await expect(owner.getByRole("button", { name: /Add to basket/ })).toHaveCount(0);
  await expect(owner.locator("main")).not.toContainText("whole book");
  await owner.goto("/admin/inventory");
  await expect(owner.locator(".stock-table")).not.toContainText("whole book");
  // its write-off stays in the history, under its product and pack name
  await expect(owner.locator("main")).toContainText("whole book · 100 pages");
});

test("staff ask for a product to go too", async ({ browser, page }) => {
  const made = await product("wish", [["100 pages", 3]]);
  const staff = await signedIn(browser, page, STAFF);
  await staff.goto(`/admin/products/${made.id}`);
  const panel = staff.locator(".visibility-panel");
  await panel.locator("summary", { hasText: "Delete this product" }).click();
  await panel.getByLabel(/^Why should it go/).fill("We no longer stock these");
  await panel.getByRole("button", { name: "Ask the owner to delete" }).click();
  await expect(panel.locator(".pack-setting-row")).toContainText("Waiting for owner");
  await expect(staff.locator(".waiting-requests")).toContainText("Delete this product");
  await shot(panel, "staff-waiting");
  expect((await Product.findById(made.id)).deletedAt).toBeUndefined();
  // they can change their mind
  await staff.locator(".waiting-requests li", { hasText: "Delete this product" }).getByRole("button", { name: "Withdraw" }).click();
  await expect(panel.locator("summary", { hasText: "Delete this product" })).toBeVisible();
});
