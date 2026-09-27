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
import { User, Product } from "../../src/lib/db/models";
import { Address, Order } from "../../src/lib/commerce/models";
import { ChatConversation } from "../../src/lib/chat/models";

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
  if (route.startsWith("/account") || route === "/checkout") return "customer";
  return "guest";
}

const samples: Record<string, string> = {};

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // the fictional demo catalog: 20 products, 8 orders, promotions, staff
  execFileSync("npx", ["tsx", "scripts/seed.ts"], {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
      APP_ORIGIN: "http://127.0.0.1:3002",
      SEED_DEMO: "true",
      NODE_ENV: "test",
    },
    stdio: "ignore",
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
  const order = await Order.findOne({ assignedTo: { $exists: true } });
  const chat = await ChatConversation.create({ customerId: customer!._id, title: "Where is my order?" });
  samples["/products/[slug]"] = `/products/${(await Product.findOne({ status: "published" }))!.slug}`;
  samples["/account/orders/[id]"] = `/account/orders/${order!._id}`;
  samples["/admin/orders/[id]"] = `/admin/orders/${order!._id}`;
  samples["/delivery/orders/[id]"] = `/delivery/orders/${order!._id}`;
  samples["/account/support/[id]"] = `/account/support/${chat._id}`;
  samples["/admin/support/[id]"] = `/admin/support/${chat._id}`;
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
    const problems = await page.evaluate(layoutProblems);
    if ((response?.status() ?? 0) >= 500) problems.unshift(`answered ${response?.status()}`);
    if (problems.length) report[path] = problems;
    if (out)
      await page.screenshot({
        path: `${out}/${info.project.name}${route.replace(/[/[\]]+/g, "_") || "_home"}.png`,
        fullPage: true,
      });
  }
  expect(report).toEqual({});
});
