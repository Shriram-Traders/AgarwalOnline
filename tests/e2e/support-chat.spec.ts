// "Talk to the store" conversations. On a 360px Android-sized phone the chat is the whole screen: its own
// bar (Back, title, status, search) replaces the shop's header and tabs, nothing runs off the right edge,
// only the messages scroll, and the typing box stays on screen. On a computer it's a card on the page
// with the same search, day labels and growing typing box.
import { test, expect, type Browser, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";
import { ChatConversation, ChatMessage } from "../../src/lib/chat/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const SHOPPER = { name: "Chat Shopper", email: "chat-shopper@e2e.test", phone: "9000000611" };
const HELPER = { name: "Store Helper", email: "chat-helper@e2e.test", phone: "9000000612" };
const out = process.env.SHOT_DIR;
let open = "";
let closed = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [shopper, helper] = await User.create([
    { ...SHOPPER, roles: ["customer"], emailVerified: true, passwordHash },
    { ...HELPER, roles: ["customer", "admin"], emailVerified: true, passwordHash },
  ]);
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const chat = await ChatConversation.create({ customerId: shopper._id, title: "No delivery slot for my order this week", status: "open", sequence: 2 });
  const first = await ChatMessage.create({
    conversationId: chat._id,
    senderId: helper._id,
    senderName: "Store Helper",
    sequence: 1,
    clientMessageId: "e2e-chat-1",
    body: "Hi! Which day suits you?",
  });
  await ChatMessage.create({
    conversationId: chat._id,
    senderId: shopper._id,
    senderName: "Chat Shopper",
    sequence: 2,
    clientMessageId: "e2e-chat-2",
    body: "Tomorrow evening please",
  });
  // the store's message came yesterday, so the chat shows "Yesterday" and then "Today" (straight to the
  // collection: Mongoose keeps createdAt as it was and quietly ignores an update to it)
  await ChatMessage.collection.updateOne({ _id: first._id }, { $set: { createdAt: yesterday } });
  open = String(chat._id);
  const done = await ChatConversation.create({ customerId: shopper._id, title: "Old question", status: "closed" });
  closed = String(done._id);
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const phone = () => test.info().project.name === "mobile";

async function signedIn(browser: Browser, page: Page) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3002",
    // the Android phone in the report was about 360px wide: narrower than the Pixel 7 the other tests use
    viewport: phone() ? { width: 360, height: 780 } : page.viewportSize()!,
    isMobile: phone(),
    hasTouch: phone(),
    reducedMotion: "reduce",
  });
  const tab = await context.newPage();
  await tab.goto("/login");
  await tab.getByRole("button", { name: "Email", exact: true }).click();
  await tab.getByLabel("Email address").fill(SHOPPER.email);
  await tab.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await tab.getByRole("button", { name: "Sign in with email" }).click();
  await tab.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return tab;
}
async function shot(page: Page, name: string) {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_chat-${name}.png` });
}
/** Every element of the chat ends inside the screen's width. */
async function overflowing(page: Page) {
  return page.locator(".chat-panel").evaluate((panel) =>
    [panel, ...panel.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
}

test("on a phone the chat is the whole screen: its own bar, nothing off the edge, the typing box on screen", async ({ browser, page }) => {
  test.skip(!phone(), "the computer layout has its own test");
  const chat = await signedIn(browser, page);
  await chat.goto(`/account/support/${open}`);
  const bar = chat.locator(".chat-bar");
  await expect(bar.getByRole("heading", { level: 1 })).toHaveText("No delivery slot for my order this week");
  await expect(bar).toContainText("Open");
  // the shop's header, tabs and the page heading step aside
  await expect(chat.locator(".mobile-nav")).toBeHidden();
  await expect(chat.locator("header.header")).toBeHidden();
  await expect(chat.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(chat.getByRole("button", { name: "Send" })).toBeVisible();
  expect(await overflowing(chat)).toEqual([]);
  expect(await chat.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // the bar at the top, the typing box at the bottom, both on screen without scrolling the page
  const top = (await bar.boundingBox())!;
  const compose = (await chat.locator(".chat-compose").boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(0);
  expect(compose.y + compose.height).toBeLessThanOrEqual(780 + 1);
  await chat.mouse.wheel(0, 600);
  expect(await chat.evaluate(() => window.scrollY)).toBe(0);
  // a day label above each day's messages
  const log = chat.getByRole("log", { name: "Conversation messages" });
  await expect(log.locator(".chat-day")).toHaveText(["Yesterday", "Today"]);
  await shot(chat, "phone");

  // search opens under the bar, finds, and closes
  await bar.getByRole("button", { name: "Search messages" }).click();
  const search = chat.getByRole("searchbox", { name: "Search loaded messages" });
  await expect(search).toBeFocused();
  await search.fill("which day");
  await expect(log.locator(".chat-message")).toHaveCount(1);
  await search.fill("zzz");
  await expect(log).toContainText("No messages match");
  expect(await overflowing(chat)).toEqual([]);
  await shot(chat, "phone-search");
  await chat.getByRole("button", { name: "Close search" }).click();
  await expect(search).toHaveCount(0);
  await expect(log.locator(".chat-message")).toHaveCount(2);

  // the typing box grows with a longer message, and Send posts it
  const box = chat.getByLabel("Your message");
  const oneLine = (await box.boundingBox())!.height;
  await box.fill("Line one\nLine two\nLine three\nLine four");
  expect((await box.boundingBox())!.height).toBeGreaterThan(oneLine + 30);
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(log.locator(".chat-message.mine").last()).toContainText("Line four");
  await expect(box).toHaveValue("");
  expect(Math.round((await box.boundingBox())!.height)).toBeLessThanOrEqual(Math.round(oneLine) + 2);
  await shot(chat, "phone-sent");

  // Back goes to the list of conversations
  await bar.getByRole("link", { name: "Back to your conversations" }).click();
  await chat.waitForURL("**/account/support");
  await expect(chat.locator(".mobile-nav")).toBeVisible();
  await chat.context().close();
});

test("a closed conversation offers Reopen above the typing box", async ({ browser, page }) => {
  const chat = await signedIn(browser, page);
  await chat.goto(`/account/support/${closed}`);
  const notice = chat.locator(".chat-notice");
  await expect(notice).toContainText("This conversation is closed. Reopen it to send a message.");
  await expect(notice.getByRole("button", { name: "Reopen conversation" })).toBeVisible();
  expect(await overflowing(chat)).toEqual([]);
  await shot(chat, "closed");
  await notice.getByRole("button", { name: "Reopen conversation" }).click();
  await expect.poll(async () => (await ChatConversation.findById(closed))?.status, { timeout: 30_000 }).toBe("open");
  await chat.context().close();
});

test("on a computer the chat is a card on the page, with search and day labels", async ({ browser, page }) => {
  test.skip(phone(), "the phone layout has its own test");
  const chat = await signedIn(browser, page);
  await chat.goto(`/account/support/${open}`);
  await expect(chat.getByRole("heading", { level: 1, name: "No delivery slot for my order this week" })).toBeVisible();
  await expect(chat.locator(".chat-bar")).toBeHidden();
  await expect(chat.locator("header.header")).toBeVisible();
  const toolbar = chat.locator(".chat-toolbar");
  await expect(toolbar).toContainText("Connected to the store");
  await toolbar.getByRole("button", { name: "Search messages" }).click();
  await chat.getByRole("searchbox", { name: "Search loaded messages" }).fill("tomorrow");
  await expect(chat.locator(".chat-message")).toHaveCount(1);
  await chat.keyboard.press("Escape");
  await expect(chat.locator(".chat-message")).toHaveCount(2);
  await expect(chat.locator(".chat-day")).toHaveText(["Yesterday", "Today"]);
  await expect(chat.getByRole("button", { name: "Send" })).toContainText("Send");
  expect(await overflowing(chat)).toEqual([]);
  await shot(chat, "desktop");
  await chat.context().close();
});
