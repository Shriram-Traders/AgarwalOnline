// What a phone fetches first (Google's modern-web-guidance, optimize-image-priority): the product
// photo that is a product page's largest paint goes first; product cards, which start below a
// phone's first screen on the home page, wait (lazy) instead of being preloaded ahead of the styles.
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";

// the demo shop, for products with photos on the home page
test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  execFileSync("npx", ["tsx", "scripts/seed.ts"], {
    env: { ...process.env, MONGODB_URI: uri, AUTH_SECRET: "e2e-local-only-secret-repeated-000000000", APP_ORIGIN: "http://127.0.0.1:3002", SEED_DEMO: "true", NODE_ENV: "test" },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("the home page's product cards load lazily, and a product page's photo comes first", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("main .product-card img");
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.evaluateAll((imgs) => imgs.filter((img) => img.getAttribute("loading") !== "lazy").length)).toBe(0);

  const href = await page.locator("main a.product-link").first().getAttribute("href");
  await page.goto(href!);
  await expect(page.locator(".product-gallery .product-photo").first()).toHaveAttribute("fetchpriority", "high");
});
