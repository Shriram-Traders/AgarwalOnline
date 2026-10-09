import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  ServiceArea,
} from "../../src/lib/db/models";
import {
  Address,
  Order,
  InventoryReservation,
  DeliverySlot,
} from "../../src/lib/commerce/models";
import { Family } from "../../src/lib/family/models";
const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const c = await Category.create({
    slug: "staples",
    name: { en: "Staples", mr: "धान्य" },
  });
  const p = await Product.create({
    slug: "everyday-basmati-rice",
    name: { en: "Everyday Basmati Rice", mr: "रोजचा बासमती तांदूळ" },
    description: { en: "Fictional test rice", mr: "प्रात्यक्षिक तांदूळ" },
    brand: "PANTRY SELECT",
    categoryId: c._id,
    categorySlug: "staples",
    status: "published",
    aliases: ["chawal"],
  });
  const v = await ProductVariant.create({
    productId: p._id,
    sku: "E2E-RICE",
    label: "1 kg",
    unit: "kg",
    packQuantity: 1,
    pricePaise: 10900,
    mrpPaise: 14000,
  });
  await InventoryItem.create({ variantId: v._id, onHand: 10 });
  const a = await ServiceArea.create({
    key: "fictional-e2e",
    name: "Fictional test area",
    enabled: true,
    pincodes: ["999999"],
    feePaise: 3000,
  });
  await DeliverySlot.create({
    areaId: a._id,
    date: "2099-01-01",
    label: "4:00 PM – 7:00 PM",
    capacity: 5,
  });
  await User.create([
    {
      phone: "9000000081",
      name: "Fictional Admin",
      email: "admin@e2e.test",
      roles: ["customer", "admin"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000082",
      name: "Fictional Delivery",
      email: "delivery@e2e.test",
      roles: ["customer", "delivery"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000083",
      name: "Fictional Owner",
      email: "owner@e2e.test",
      roles: ["customer", "super-admin"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000089",
      name: "Fictional Friend",
      email: "friend@e2e.test",
      roles: ["customer"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    // signs in by password: one-time codes for the shared test number are rate limited across this file
    {
      phone: "9000000090",
      name: "Fictional Planner",
      email: "planner@e2e.test",
      roles: ["customer"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000091",
      name: "Fictional Parent",
      email: "parent@e2e.test",
      roles: ["customer"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000092",
      name: "Fictional Partner",
      email: "partner@e2e.test",
      roles: ["customer"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
    {
      phone: "9000000093",
      name: "Fictional Tabholder",
      email: "tabholder@e2e.test",
      roles: ["customer"],
      passwordHash: await bcrypt.hash("Local-test-password-123", 12),
    },
  ]);
  // the parent checks out a school kit, so they need somewhere to deliver it
  await Address.create({
    customerId: (await User.findOne({ email: "parent@e2e.test" }))!._id,
    name: "Fictional Parent",
    phone: "9000000091",
    line: "Fictional lane",
    pin: "999999",
    areaId: a._id,
    isDefault: true,
  });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
async function login(page: import("@playwright/test").Page) {
  if (await User.exists({ phone: "9000000088" })) {
    await page.goto("/login");
    await page.getByRole("button", { name: /Use OTP/ }).click();
    await page.getByLabel("Mobile number").fill("9000000088");
    await page.getByRole("button", { name: "Sign in with OTP" }).click();
  } else {
    await page.goto("/signup");
    await page.getByLabel("Email address").fill("neighbour@e2e.test");
    await page.getByLabel("Mobile number").fill("9000000088");
    await page.getByRole("button", { name: "Start account creation" }).click();
    await page.getByLabel("Your name").fill("Neighbour");
    await page.getByLabel("Create password").fill("Local-test-password-123");
    await page.getByLabel("Confirm password").fill("Local-test-password-123");
  }
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  // customers land in the shop after signing in; the account is one tap away
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Hello, Neighbour" }),
  ).toBeVisible();
}
test("customer OTP, basket, address, COD, tracking and cancellation", async ({
  page,
}) => {
  await login(page);
  // top-right account menu: customer links, no staff workspace
  if (await page.locator(".account-menu").isVisible()) {
    await page.locator(".account-menu > summary").click();
    await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    await expect(page.getByText("Store workspace", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  const sessionCookie = (await page.context().cookies()).find(
    (c) => c.name === "ags_session",
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
  await page.goto("/products/everyday-basmati-rice");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByRole("status")).toContainText("Basket updated");
  await page.goto("/account/addresses");
  await page.getByLabel("Recipient name").fill("Fictional Neighbour");
  await page.getByLabel("Mobile number").fill("9000000088");
  await page
    .getByLabel("House, building, street")
    .fill("Fictional House 1, Test Street");
  // a rejected save keeps everything that was typed
  await page.getByLabel("PIN code").fill("111111");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(
    page.getByText("This PIN code is not enabled for the selected area."),
  ).toBeVisible();
  await expect(page.getByLabel("Recipient name")).toHaveValue("Fictional Neighbour");
  await expect(page.getByLabel("House, building, street")).toHaveValue(
    "Fictional House 1, Test Street",
  );
  await page.getByLabel("PIN code").fill("999999");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("status")).toContainText("Address saved");
  await page.goto("/checkout");
  await page
    .getByLabel("Delivery slot")
    .selectOption({ label: "Thu, 1 Jan · 4:00 PM – 7:00 PM" });
  await expect(
    page.getByRole("heading", { name: "Total to collect: ₹139" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Confirm Cash on Delivery order" })
    .click();
  await expect(page).toHaveURL(/\/account\/orders\/[a-f0-9]+/);
  await expect(page.getByText(/^Status: Order placed$/i)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Cancel this order" }).click();
  // the confirm dialog is aria-modal, so it must take focus and close on Escape
  await expect(
    page.getByRole("button", { name: /^Yes, / }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".confirm-modal")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel this order" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancel this order" }).click();
  await page.getByRole("button", { name: /^Yes, / }).click();
  await expect(
    page.getByText(/^Status: Cancelled$/i),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
});
test("multilingual search and empty results", async ({ page }) => {
  for (const q of ["Rice", "Chawal", "तांदूळ"]) {
    await page.goto(`/catalog?q=${encodeURIComponent(q)}`);
    await expect(
      page.getByRole("heading", { name: "Everyday Basmati Rice", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/catalog?q=nothing-here");
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  await page.goto("/catalog?lang=mr");
  await expect(
    page.getByRole("heading", { name: "रोजचा बासमती तांदूळ", exact: true }),
  ).toBeVisible();
});
test("staff login and delivery role restrictions", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill("delivery@e2e.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-test-password-123");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL(/\/delivery/);
  // staff reach their workspace from the same account menu as customers
  await page.goto("/");
  if (await page.locator(".account-menu").isVisible()) {
    await page.locator(".account-menu > summary").click();
    await page.getByRole("link", { name: "My deliveries" }).click();
  } else {
    // phones hide the menu; the You tab's account page carries the workspace tile
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "You" }).click();
    await page.getByRole("link", { name: /Open your workspace/ }).click();
  }
  await expect(page).toHaveURL("/delivery");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await page.goto("/super-admin");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
});

test("Super Admin manages staff and reviews the audit trail", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill("owner@e2e.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-test-password-123");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  // owners open on the day's orders, with their settings one link away
  await expect(page).toHaveURL("/admin");
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Fictional Owner$/ }),
  ).toBeVisible();

  await User.create({
    phone: "9000000085",
    name: "Picker Candidate",
    email: "picker@e2e.test",
    roles: ["customer"],
  });
  // Staff & roles sits in the folded Setup group on a wide screen, and in the More sheet on a phone
  const more = page.getByRole("navigation", { name: "Workspace tabs" }).getByRole("button", { name: "More" });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole("dialog", { name: "Workspace menu" }).getByRole("link", { name: "Staff & roles" }).click();
  } else {
    const menu = page.getByRole("navigation", { name: "Staff workspace" });
    const setup = menu.getByRole("button", { name: /^Setup/ });
    if ((await setup.getAttribute("aria-expanded")) === "false") await setup.click();
    await menu.getByRole("link", { name: "Staff & roles" }).click();
  }
  // an existing account is picked from the list and given a role
  await page.getByLabel("Name, phone or email").fill("Picker");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByLabel("Role for Picker Candidate").selectOption("delivery");
  await page
    .locator("form", { has: page.getByLabel("Role for Picker Candidate") })
    .getByRole("button", { name: "Add to team" })
    .click();
  await page.getByRole("button", { name: /^Yes, / }).click();
  await expect(page.getByRole("status")).toContainText("Picker Candidate is now on the team");
  expect((await User.findOne({ phone: "9000000085" }))!.roles).toEqual(["customer", "delivery"]);

  // someone with no account yet gets a new one
  await page.goto("/super-admin/staff");
  await page.getByText("Not in the list? Create a new account").click();
  const form = page.locator(".create-staff form");
  await form.getByLabel("Name").fill("New Delivery Partner");
  await form.getByLabel("Work email").fill("new-delivery@e2e.test");
  await form.getByLabel("Phone").fill("9000000084");
  await form.getByLabel("Role").selectOption("delivery");
  await form.getByLabel("Temporary password").fill("Temporary-password-123");
  await form.getByRole("button", { name: "Create staff account" }).click();
  // giving someone workspace access asks first
  await page.getByRole("button", { name: /^Yes, / }).click();
  await expect(page.getByRole("status")).toContainText("Staff account created");
  await expect(page.getByText("New Delivery Partner")).toBeVisible();

  await page.goto("/super-admin/audit");
  // inside main: in dev a hidden streamed copy of the page can linger beside it
  await expect(page.getByRole("main").getByText("staff.create", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile storefront stays within viewport and navigation is visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Search products" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shop by aisle" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // phones switch language from the top strip, not only from the footer
  const language = page.locator(".top-strip").getByRole("form", { name: "Language" });
  await language.getByRole("button", { name: "मराठी" }).click();
  await expect(language.getByRole("button", { name: "मराठी" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "मुख्य" })).toBeVisible();
  await language.getByRole("button", { name: "English" }).click();
  await expect(language.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: ".local/mobile-storefront.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/desktop-storefront.png",
    fullPage: true,
  });
});

test("core screens have no automated WCAG AA violations", async ({ page }) => {
  for (const path of ["/", "/catalog", "/login"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test("admin packing through partner delivery and cash reconciliation", async ({
  page,
  browser,
}) => {
  test.slow();
  await login(page);
  const customer = await User.findOne({ phone: "9000000088" });
  const variant = await ProductVariant.findOne({ sku: "E2E-RICE" });
  const slot = await DeliverySlot.findOne({ date: "2099-01-01" });
  const order = await Order.create({
    customerId: customer!._id,
    number: "E2E-OPS-1",
    idempotencyKey: "e2e-ops",
    items: [
      {
        variantId: variant!._id,
        name: "Everyday Basmati Rice",
        label: "1 kg",
        quantity: 1,
        pricePaise: 10900,
        linePaise: 10900,
      },
    ],
    address: {
      name: "Fictional Customer",
      phone: "9000000088",
      line: "Fictional Test Street",
      pin: "999999",
      areaName: "Fictional test area",
    },
    slotId: slot!._id,
    deliveryDate: "2099-01-01",
    deliveryWindow: "4–7 PM",
    paymentMethod: "cod",
    subtotalPaise: 10900,
    deliveryPaise: 0,
    totalPaise: 10900,
  });
  await InventoryItem.updateOne(
    { variantId: variant!._id },
    { $inc: { reserved: 1 } },
  );
  await InventoryReservation.create({
    orderId: order._id,
    variantId: variant!._id,
    quantity: 1,
  });
  const adminContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
  });
  const partnerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
  });
  const adminPage = await adminContext.newPage();
  const partnerPage = await partnerContext.newPage();
  try {
    for (const [p, email] of [
      [adminPage, "admin@e2e.test"],
      [partnerPage, "delivery@e2e.test"],
    ] as const) {
      await p.goto("/login");
      await p.getByRole("button", { name: "Email", exact: true }).click();
      await p.getByLabel("Email address").fill(email);
      await p
        .getByLabel("Password", { exact: true })
        .fill("Local-test-password-123");
      await p.getByRole("button", { name: "Sign in with email" }).click();
      await expect(p).not.toHaveURL(/staff\/login/);
    }
    await adminPage.goto(`/admin/orders/${order._id}`);
    await adminPage
      .getByRole("button", { name: "Confirm order", exact: true })
      .click();
    await adminPage.getByRole("button", { name: "Start picking" }).click();
    await adminPage.getByLabel("Packed quantity").fill("1");
    await adminPage
      .getByRole("button", { name: "Save packing checklist" })
      .click();
    await expect(adminPage.getByText("All quantities checked.")).toBeVisible();
    await adminPage.getByRole("button", { name: "Mark packed" }).click();
    await adminPage.getByRole("button", { name: "Ready for pickup" }).click();
    await adminPage
      .getByRole("combobox", { name: "Partner", exact: true })
      .selectOption({ label: "Fictional Delivery" });
    await adminPage
      .getByRole("button", { name: "Assign delivery", exact: true })
      .click();
    await expect(
      adminPage.getByText("delivery: unassigned → assigned"),
    ).toBeVisible();
    await partnerPage.goto(`/delivery/orders/${order._id}`);
    await partnerPage
      .getByRole("button", { name: "Start delivery", exact: true })
      .click();
    await expect(
      partnerPage.getByLabel("Customer delivery code"),
    ).toBeVisible();
    await page.goto(`/account/orders/${order._id}`);
    await page
      .getByRole("button", { name: "Request delivery confirmation code" })
      .click();
    await expect(
      page.getByText("Development delivery code: 246810"),
    ).toBeVisible();
    await partnerPage.getByLabel("Customer delivery code").fill("246810");
    await partnerPage.getByRole("checkbox").check();
    await partnerPage
      .getByRole("button", { name: "Verify code & mark delivered" })
      .click();
    await expect(partnerPage).toHaveURL("/delivery");
    await adminPage.goto(`/admin/orders/${order._id}`);
    await adminPage
      .getByRole("button", { name: "Complete order", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Record cash handover" })
      .click();
  await adminPage.getByRole("button", { name: /^Yes, / }).click();
    await expect(
      adminPage.getByText("Cash reconciled", { exact: true }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await partnerContext.close();
  }
});

test("customer and support exchange messages in real time", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/account/support");
  await page.getByLabel("Subject").fill("A question for the store");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/account\/support\/[a-f\d]+/);
  const conversationId = page.url().split("/").pop()!;
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
  });
  const support = await context.newPage();
  try {
    await support.goto("/login");
    await support.getByRole("button", { name: "Email", exact: true }).click();
    await support.getByLabel("Email address").fill("admin@e2e.test");
    await support
      .getByLabel("Password", { exact: true })
      .fill("Local-test-password-123");
    await support.getByRole("button", { name: "Sign in with email" }).click();
    await expect(support).toHaveURL("/admin");
    await support.goto(`/admin/support/${conversationId}`);
    await expect(
      page.getByText("Connected to the store", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Can you help with my grocery list?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      support.getByText("Can you help with my grocery list?", { exact: true }),
    ).toBeVisible();
    await support.getByLabel("Internal note", { exact: true }).check();
    await support
      .getByLabel("Your message", { exact: true })
      .fill("Internal follow-up, customers must not see this");
    await support.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      support.getByText("Internal follow-up, customers must not see this", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Internal follow-up, customers must not see this", {
        exact: true,
      }),
    ).toHaveCount(0);
    await support.getByLabel("Internal note", { exact: true }).uncheck();
    await support
      .getByLabel("Your message", { exact: true })
      .fill("Of course. Tell us what you need.");
    await support.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Of course. Tell us what you need.", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

/** Opt-in screenshots of states a page crawl never reaches (an open sheet or menu): set SHOT_DIR. */
async function shot(page: import("@playwright/test").Page, name: string) {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${test.info().project.name}-${name}.png` });
}

/** Fills the email sign-in form on the page already showing it. */
async function emailSignIn(page: import("@playwright/test").Page, email: string) {
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Local-test-password-123");
  await page.getByRole("button", { name: "Sign in with email" }).click();
}

test("a board saves things and friends join it", async ({ page, browser }) => {
  await page.goto("/login");
  await emailSignIn(page, "planner@e2e.test");
  await page.waitForURL((url) => url.pathname !== "/login");
  // Save → "Save to…" → a new board, right from the product page
  await page.goto("/products/everyday-basmati-rice");
  await page.locator("summary", { hasText: "Save" }).click();
  await page.getByLabel("New board").fill("Diwali gifts");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to the board.")).toBeVisible();
  await shot(page, "save-to-board");
  await page.goto("/account/wishlist");
  // "Saved" is called the Wishlist everywhere now
  await expect(page.getByRole("link", { name: /All wishlist items/ })).toContainText("1 item");
  await page.getByRole("link", { name: /Diwali gifts/ }).click();
  await expect(page.getByRole("heading", { name: "Diwali gifts", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const invite = new URL(await page.getByLabel("Link", { exact: true }).inputValue()).pathname;
  await shot(page, "board-invite");

  // a neighbour opens it signed out, signs in, lands back on it and joins
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    viewport: page.viewportSize()!,
  });
  const friend = await context.newPage();
  try {
    await friend.goto(invite);
    await friend.getByRole("link", { name: "Sign in to join" }).click();
    await emailSignIn(friend, "friend@e2e.test");
    await expect(friend).toHaveURL(invite);
    await friend.getByRole("button", { name: "Join this board" }).click();
    await expect(friend.getByRole("heading", { name: "Diwali gifts", level: 1 })).toBeVisible();
    await friend.getByRole("button", { name: "Increase quantity" }).click();
    await expect(friend.locator(".board-item output")).toHaveText("2");
  } finally {
    await context.close();
  }

  // the owner sees the change and who joined
  await page.reload();
  await expect(page.locator(".board-item output")).toHaveText("2");
  await expect(page.getByText(/You, Fictional/)).toBeVisible();
  // "Buy this board" fills the basket and goes straight to checkout
  await page.getByRole("button", { name: /Buy this board/ }).click();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("a second basket is filled from a product page and ordered", async ({ page }) => {
  await page.goto("/login");
  await emailSignIn(page, "planner@e2e.test");
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto("/products/everyday-basmati-rice");
  await page.locator("summary", { hasText: "Add to a different basket" }).click();
  await page.getByLabel("New basket").fill("Family monthly");
  await page.getByRole("button", { name: "Create & add" }).click();
  await expect(page.getByText("Added to Family monthly.")).toBeVisible();
  await page.goto("/cart");
  const pills = page.getByRole("navigation", { name: "Your baskets" });
  await expect(pills.getByRole("link", { name: /My basket/ })).toHaveAttribute("aria-current", "page");
  await pills.getByRole("link", { name: /Family monthly/ }).click();
  await expect(page.locator(".basket-line")).toHaveCount(1);
  // sharing: one switch decides whether the link lets people edit
  await page.getByRole("button", { name: "Share this basket" }).click();
  const toggle = page.getByRole("switch", { name: /People with the link can add and change things/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await shot(page, "basket-share");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Order Family monthly" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("a family: start it, add a child, and a partner joins with the one-time link", async ({ page, browser }) => {
  await page.goto("/login");
  await emailSignIn(page, "parent@e2e.test");
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto("/account");
  await page.getByRole("link", { name: /^Family/ }).click();
  await page.getByLabel("Family name").fill("Sharma family");
  await page.getByRole("button", { name: "Start the family" }).click();
  await expect(page.getByRole("heading", { name: "Sharma family", level: 1 })).toBeVisible();
  // with no children yet, the add-child form is already open
  await page.getByLabel("Name", { exact: true }).fill("Aarav");
  await page.getByLabel("School").fill("St. Mary's");
  await page.getByLabel("Class").selectOption("5");
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page.getByText("Class 5 · St. Mary's")).toBeVisible();
  await page.getByRole("button", { name: "Invite someone to the family" }).click();
  const invite = new URL(await page.getByLabel("Link", { exact: true }).inputValue()).pathname;
  await shot(page, "family-invite");
  await page.keyboard.press("Escape");

  // the partner opens it signed out, signs in, lands back on it and joins
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3002", viewport: page.viewportSize()! });
  const partner = await context.newPage();
  try {
    await partner.goto(invite);
    await expect(partner.getByText("What joining shares")).toBeVisible();
    await partner.getByRole("link", { name: "Sign in to join" }).click();
    await emailSignIn(partner, "partner@e2e.test");
    await expect(partner).toHaveURL(invite);
    await partner.getByRole("button", { name: /Join .Sharma family./ }).click();
    await expect(partner).toHaveURL(/\/account\/family$/);
    await expect(partner.getByText("Class 5 · St. Mary's")).toBeVisible();
    // one link, one person: it no longer opens
    await partner.goto(invite);
    await expect(partner.getByRole("heading", { name: /couldn.t find/ })).toBeVisible();
  } finally {
    await context.close();
  }

  await page.reload();
  await expect(page.getByText(/You and Fictional/)).toBeVisible();

  // the store builds Aarav's class list on a board and publishes it as a kit; both parents are told
  const staff = await browser.newContext({ baseURL: "http://127.0.0.1:3002", viewport: page.viewportSize()! });
  const desk = await staff.newPage();
  try {
    await desk.goto("/login");
    await emailSignIn(desk, "owner@e2e.test");
    await desk.waitForURL((url) => url.pathname !== "/login");
    await desk.goto("/products/everyday-basmati-rice");
    await desk.locator("summary", { hasText: "Save" }).click();
    await desk.getByLabel("New board").fill("St. Mary's Class 5");
    await desk.getByRole("button", { name: "Save", exact: true }).click();
    await expect(desk.getByText("Saved to the board.")).toBeVisible();
    await desk.goto("/admin/kits");
    const add = desk.locator("details.create-staff");
    await add.locator("summary").click();
    await add.getByLabel("School", { exact: true }).fill("St. Mary's");
    await add.getByRole("combobox", { name: "Class", exact: true }).selectOption("5");
    await add.getByLabel(/Items from your board/).selectOption({ index: 1 });
    await add.getByRole("button", { name: "Save as draft" }).click();
    await expect(desk).toHaveURL(/edit=/);
    await desk.getByRole("button", { name: "Publish this kit" }).click();
    await desk.getByRole("button", { name: /^Yes, / }).click();
    await expect(desk.getByText("Published. 2 parents were told.")).toBeVisible();
    await shot(desk, "school-kit-admin");
  } finally {
    await staff.close();
  }

  // one tap puts the kit in the basket and opens checkout with the order already for Aarav
  await page.reload();
  await shot(page, "family-hub");
  await page.getByRole("button", { name: /Buy the kit/ }).click();
  await expect(page).toHaveURL(/\/checkout\?for=/);
  await expect(page.getByLabel("Who is it for?").locator("option:checked")).toHaveText(/Aarav/);
});

test("a family tab: asked for, opened by the owner, an order on it, paid at the desk", async ({ page, browser }) => {
  const holder = (await User.findOne({ email: "tabholder@e2e.test" }))!;
  await Family.create({ name: "Khata family", ownerId: holder._id, adults: [holder._id], inviteToken: "e2e-khata-invite-token00" });
  const area = (await ServiceArea.findOne({ key: "fictional-e2e" }))!;
  await Address.create({ customerId: holder._id, name: "Tab Holder", phone: "9000000093", line: "Fictional lane 2", pin: "999999", areaId: area._id, isDefault: true });
  await page.goto("/login");
  await emailSignIn(page, "tabholder@e2e.test");
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto("/account/family");
  await page.getByRole("button", { name: "Ask the store for a tab" }).click();
  await expect(page.getByText("You asked for a tab.")).toBeVisible();

  // the owner opens it with a ₹500 limit
  const office = await browser.newContext({ baseURL: "http://127.0.0.1:3002", viewport: page.viewportSize()! });
  const desk = await office.newPage();
  try {
    await desk.goto("/login");
    await emailSignIn(desk, "owner@e2e.test");
    await desk.waitForURL((url) => url.pathname !== "/login");
    await desk.goto("/admin/tabs?status=requested");
    await desk.getByRole("link", { name: /Khata family/ }).click();
    await desk.getByLabel("Tab limit").fill("500");
    await desk.getByRole("button", { name: "Open the tab" }).click();
    await desk.getByRole("button", { name: /^Yes, / }).click();
    // the open tab's controls replace the request's
    await expect(desk.getByRole("button", { name: "Pause the tab" })).toBeVisible();

    // the family puts an order on it: nothing to pay at checkout
    await page.goto("/products/everyday-basmati-rice");
    await page.getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByRole("status")).toContainText("Basket updated");
    await page.goto("/checkout");
    await page.getByLabel("Delivery slot").selectOption({ label: "Thu, 1 Jan · 4:00 PM – 7:00 PM" });
    await page.getByRole("radio", { name: /Add to family tab/ }).check();
    await expect(page.getByRole("heading", { name: "Total on the tab: ₹139" })).toBeVisible();
    // only Cash on Delivery asks for the extra tick
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Put this order on the family tab" }).click();
    await expect(page).toHaveURL(/\/account\/orders\/[a-f0-9]+/);
    await expect(page.getByText("On your family tab, settled with the store monthly")).toBeVisible();
    await page.goto("/account/family");
    await expect(page.locator("#tab")).toContainText("₹139");
    await shot(page, "family-tab");

    // the desk records the UPI payment, and nothing is owed
    await desk.reload();
    await desk.getByLabel("Amount received").fill("139");
    await desk.getByLabel("Paid by").selectOption("upi");
    await desk.getByLabel(/^Reference/).fill("412345678901");
    await desk.getByRole("button", { name: "Record payment" }).click();
    await desk.getByRole("button", { name: /^Yes, / }).click();
    // paid in full: the payment is listed and the form to take more is gone
    await expect(desk.getByText("UPI 412345678901")).toBeVisible();
    await expect(desk.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    await shot(desk, "family-tab-admin");
  } finally {
    await office.close();
  }
});
