import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { SystemSetting } from "../../src/lib/commerce/models";
import { LEGAL_PAGES, POLICIES_HOME, legalPage } from "../../src/lib/legal/pages";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await SystemSetting.deleteOne({ key: "tax-details" });
});
test.afterAll(async () => {
  await SystemSetting.deleteOne({ key: "tax-details" });
  await mongoose.disconnect();
});

test("the footer links every policy, and each page's contents point at its sections", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Policies", exact: true });
  for (const policy of LEGAL_PAGES)
    await expect(footer.getByRole("link", { name: policy.title.en })).toHaveAttribute("href", policy.href);
  for (const policy of LEGAL_PAGES) {
    const response = await page.goto(policy.href);
    expect(response?.status(), policy.href).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: policy.title.en })).toBeVisible();
    await expect(page).toHaveTitle(`${policy.title.en} | Agarwal General Stores`);
    const targets = await page
      .locator(".legal-toc a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")!.slice(1)));
    expect(targets.length, policy.href).toBeGreaterThan(2);
    for (const id of targets) await expect(page.locator(`section#${id}`), `${policy.href}#${id}`).toHaveCount(1);
  }
});

test("the policy home lists every policy in order, and they can be read one after another", async ({ page }) => {
  await page.goto(POLICIES_HOME.href);
  await expect(page.getByRole("heading", { level: 1, name: "Store policies" })).toBeVisible();
  const cards = page.locator(".policy-list a");
  await expect(cards).toHaveCount(LEGAL_PAGES.length);
  for (const [i, policy] of LEGAL_PAGES.entries()) await expect(cards.nth(i)).toHaveAttribute("href", policy.href);
  const tabs = page.getByRole("navigation", { name: "Store policies" });
  await expect(tabs.getByRole("link", { name: "All policies" })).toHaveAttribute("aria-current", "page");
  // Next from the first policy to the last, then back to the list
  await cards.first().click();
  for (const [i, policy] of LEGAL_PAGES.entries()) {
    await expect(page).toHaveURL(policy.href);
    await expect(tabs.getByRole("link", { name: policy.title.en })).toHaveAttribute("aria-current", "page");
    const next = page.getByRole("navigation", { name: "Read the policies in order" }).getByRole("link", { name: /Next/ });
    await expect(next).toContainText(LEGAL_PAGES[i + 1]?.title.en ?? "All policies");
    await next.click();
  }
  await expect(page).toHaveURL(POLICIES_HOME.href);
});

test("the short addresses forward to the policy pages", async ({ page }) => {
  for (const policy of LEGAL_PAGES) {
    await page.goto(`/${policy.key}`);
    await expect(page).toHaveURL(policy.href);
  }
});

test("a link to one section opens the page at that section", async ({ page }) => {
  await page.goto("/terms#disputes");
  await expect(page).toHaveURL("/p/terms-and-conditions#disputes");
  await expect(page.getByRole("heading", { name: "Disputes and final decision" })).toBeInViewport();
  await expect(page.locator("#disputes")).toContainText("its decision is final within the store's own process");
  await expect(page.locator("#disputes")).toContainText("Consumer Protection Act, 2019");
});

test("the Marathi pages are in Marathi and say the English text prevails", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "ags_locale", value: "mr", url: baseURL! }]);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "गोपनीयता धोरण" })).toBeVisible();
  await expect(page.getByText("इंग्रजी आवृत्ती ग्राह्य धरली जाईल")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "धोरणे", exact: true }).getByRole("link", { name: "अटी व शर्ती" })).toBeAttached();
});

test("the Contact page names the grievance officer once Store settings has one", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator("#grievance")).toContainText("Being added");
  await SystemSetting.updateOne(
    { key: "tax-details" },
    {
      $set: {
        value: {
          legalName: "Agarwal General Stores",
          address: "Main Road, Nagothane, Raigad 402106",
          stateCode: "27",
          phone: "9876543210",
          email: "help@example.in",
          grievanceName: "Fictional Officer",
          grievanceDesignation: "Proprietor",
        },
      },
    },
    { upsert: true },
  );
  await page.reload();
  const grievance = page.locator("#grievance");
  await expect(grievance).toContainText("Fictional Officer");
  await expect(grievance).toContainText("Proprietor");
  await expect(grievance.getByRole("link", { name: "9876543210" })).toHaveAttribute("href", "tel:+919876543210");
  await expect(grievance).not.toContainText("Being added");
  await SystemSetting.deleteOne({ key: "tax-details" });
});

test("signing in and signing up name the policies, opening them in a new tab", async ({ page }) => {
  for (const [path, start] of [
    ["/login", "By signing in or continuing with Google"],
    ["/signup", "By creating an account or continuing with Google"],
  ]) {
    await page.goto(path);
    const notice = page.locator(".auth-legal");
    await expect(notice).toContainText(start);
    for (const policy of [legalPage("terms"), legalPage("privacy")]) {
      const link = notice.getByRole("link", { name: policy.title.en });
      await expect(link).toHaveAttribute("href", policy.href);
      await expect(link).toHaveAttribute("target", "_blank");
    }
  }
});
