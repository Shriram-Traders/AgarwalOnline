// Product photos at desktop and phone width: several photos on Add product, put in order and sent
// with the product; then on Edit product more uploads, a new cover, a removal, and the shop
// showing them in that order.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, Product, User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const OWNER = { name: "Photo Owner", email: "photo-owner@e2e.test", phone: "9000000311" };
const out = process.env.SHOT_DIR;
// a 1×1 PNG: the upload path checks type and size, not pixels
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);
const photo = (name: string) => ({ name, mimeType: "image/png", buffer: png });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // the only owner: a product they add goes live at once
  await User.create({ ...OWNER, roles: ["customer", "super-admin"], emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 12) });
  await Category.create({ slug: "stationery", name: { en: "Stationery", mr: "स्टेशनरी" } });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_photos-${name}.png`, fullPage: true });
}
const slugFor = () => `photo-pen-${test.info().project.name}`;
/** The photos in the panel, in order, as the form will send them. */
const panelOrder = (page: Page) => page.locator('main input[type="hidden"][name="images"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test("Add product: several photos, put in order, go live with the product", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/products/new");
  const main = page.locator("main");
  const photos = main.locator("#photos");
  await expect(photos.getByText("Add photos")).toBeVisible();

  await photos.locator('input[type="file"]').setInputFiles([photo("one.png"), photo("two.png"), photo("three.png")]);
  await expect(photos.getByRole("status")).toHaveText("3 photos added.", { timeout: 30_000 });
  const list = photos.getByRole("list", { name: /the first is the cover/ });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  const uploaded = await panelOrder(page);
  expect(uploaded).toHaveLength(3);

  // the third becomes the cover, then the first moves to the end
  await photos.getByRole("button", { name: "Make photo 3 the cover" }).click();
  await expect(list.getByRole("listitem").first()).toHaveAccessibleName("Photo 1 of 3, cover");
  await photos.getByRole("button", { name: "Move photo 2 later" }).click();
  const order = await panelOrder(page);
  expect(order).toEqual([uploaded[2], uploaded[1], uploaded[0]]);
  await shot(page, "add");
  const results = await new AxeBuilder({ page }).include("#photos").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);

  await main.getByLabel("English name").fill("Photo Pen Set");
  await main.getByLabel("Marathi name").fill("फोटो पेन संच");
  await main.getByLabel("English description").fill("Pens for the photo test");
  await main.getByLabel("Marathi description").fill("फोटो चाचणीचे पेन");
  await main.getByLabel(/^Web address/).fill(slugFor());
  await main.getByLabel(/^Pack label/).fill("Pack of 5");
  await main.getByLabel(/^SKU/).fill(`PHOTO-PEN-${test.info().project.name.toUpperCase()}`);
  await main.getByLabel("Pack quantity").fill("5");
  await main.getByLabel("Selling price (₹)").fill("99");
  await main.getByLabel(/^MRP/).fill("120");
  await main.getByLabel("Opening stock").fill("20");
  await main.getByRole("button", { name: "Send for approval" }).click();
  await expect(main.getByText("Product added. It is in the shop now.")).toBeVisible({ timeout: 30_000 });
  // the panel starts empty again for the next product
  await expect(photos.getByRole("listitem")).toHaveCount(0);

  const product = await Product.findOne({ slug: slugFor() });
  expect(product.images).toEqual(order);
  expect(product.image).toBe(order[0]);

  // the shop shows them in that order
  await page.goto(`/products/${slugFor()}`);
  const gallery = page.locator("main .product-gallery");
  const id = (url: string) => url.split("/").pop()!;
  await expect(gallery.locator(".product-art img")).toHaveAttribute("src", new RegExp(id(order[0])));
  const thumbs = gallery.getByRole("button", { name: /Show product image/ });
  await expect(thumbs).toHaveCount(3);
  for (const [index, url] of order.entries()) await expect(thumbs.nth(index).locator("img")).toHaveAttribute("src", new RegExp(id(url)));
});

test("Edit product: more photos, a new cover, a removal, and the shop follows", async ({ page }) => {
  await signIn(page);
  const product = await Product.findOne({ slug: slugFor() });
  const before = product.images as string[];
  await page.goto(`/admin/products/${product._id}`);
  const photos = page.locator("main #photos");
  const list = photos.getByRole("list", { name: /the first is the cover/ });
  await expect(list.getByRole("listitem")).toHaveCount(3);

  // uploads are kept at once, at the end, and don't take the cover
  await photos.locator('input[type="file"]').setInputFiles([photo("four.png"), photo("five.png")]);
  await expect(photos.getByRole("status")).toHaveText("2 photos added.", { timeout: 30_000 });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect.poll(async () => ((await Product.findById(product._id)).images as string[]).length).toBe(5);
  const withUploads = (await Product.findById(product._id)).images as string[];
  expect(withUploads.slice(0, 3)).toEqual(before);
  expect((await Product.findById(product._id)).image).toBe(before[0]);
  await expect(photos.getByRole("button", { name: "Save photo order" })).toBeDisabled();

  // the 4th becomes the cover, then the (now) 2nd is removed
  await photos.getByRole("button", { name: "Make photo 4 the cover" }).click();
  await photos.getByRole("button", { name: "Remove photo 2" }).click();
  await photos.getByRole("group", { name: "Remove photo 2?" }).getByRole("button", { name: "Yes" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(photos.getByText("Unsaved changes")).toBeVisible();
  await shot(page, "edit");
  await photos.getByRole("button", { name: "Save photo order" }).click();
  await expect(photos.getByRole("status")).toHaveText("Photos saved.");
  await expect(photos.getByText("Unsaved changes")).toHaveCount(0);

  const expected = [withUploads[3], withUploads[1], withUploads[2], withUploads[4]];
  const saved = await Product.findById(product._id);
  expect(saved.images).toEqual(expected);
  expect(saved.image).toBe(expected[0]);

  // the details form no longer touches the photos
  await page.locator("main").getByLabel("English name").fill("Photo Pen Set, blue");
  await page.locator("main").getByRole("button", { name: "Save product details" }).click();
  await expect(page.locator("main").getByText("Product details saved.")).toBeVisible();
  expect((await Product.findById(product._id)).images).toEqual(expected);

  // the shop's card shows the new cover
  await page.goto(`/catalog?q=${encodeURIComponent("photo pen")}`);
  const card = page.locator("main").locator(".product-card", { hasText: "Photo Pen Set, blue" });
  await expect(card.locator("img").first()).toHaveAttribute("src", new RegExp(expected[0].split("/").pop()!));
});
