// The developer credit, at desktop and phone width: every shop page ends with a "Developed by" card
// that leads to /p/team; only Tech sees Settings → Developer and team, and what Tech saves there
// shows on the card and the team page, the uploaded photo included. An owner without Tech doesn't get the section.
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const PEOPLE = {
  tech: { name: "Team Tech", email: "team-tech@e2e.test", phone: "9000000141", roles: ["customer", "super-admin", "tech"] },
  owner: { name: "Team Owner", email: "team-owner@e2e.test", phone: "9000000142", roles: ["customer", "super-admin"] },
  shopper: { name: "Team Shopper", email: "team-shopper@e2e.test", phone: "9000000143", roles: ["customer"] },
};
type Who = keyof typeof PEOPLE;
const out = process.env.SHOT_DIR;

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create(Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })));
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, info: TestInfo, who: Who) {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

test("every shop page ends with the developer's card, which leads to the team", async ({ page }, info) => {
  await page.goto("/p");
  const card = page.getByRole("region", { name: "Developed by Krish Modi" });
  await expect(card.getByText("Lead developer")).toBeVisible();
  await expect(card.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:krishmodi3030@gmail.com");
  // nothing filled in yet: no empty WhatsApp or LinkedIn buttons
  await expect(card.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  if (out) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${info.project.name}_dev-card.png`, fullPage: false });
  }
  await card.getByRole("link", { name: "Meet the team" }).click();
  await expect(page).toHaveURL(/\/p\/team$/);
  await expect(page.getByRole("heading", { name: "The team behind the site" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Swarnabh" })).toBeVisible();
  await expect(page.getByRole("link", { name: "krishmodi3030@gmail.com" })).toBeVisible();
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_team-page.png`, fullPage: true });
});

test("only Tech changes the credits, and the card shows what Tech saves", async ({ browser }, info) => {
  const owner = await signedIn(browser, info, "owner");
  await owner.goto("/super-admin");
  await expect(owner.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(owner.getByRole("link", { name: /Developer and team/ })).toHaveCount(0);
  await owner.context().close();

  const tech = await signedIn(browser, info, "tech");
  await tech.goto("/super-admin#team");
  const section = tech.locator("#team");
  await expect(section.getByRole("heading", { name: "Developer and team" })).toBeVisible();
  // the long section never makes the page scroll sideways; any box running off the edge is named
  const offEdge = await tech.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
  expect(offEdge).toEqual([]);
  if (out) await tech.screenshot({ path: `${out}/${info.project.name}_team-settings-page.png`, fullPage: true });
  await section.getByLabel("WhatsApp number").fill("9876543210");
  // a wide photo opens in the framing square: drag it and zoom, then Use this photo uploads that square
  const wide = Buffer.from(
    (
      await tech.evaluate(() => {
        const canvas = Object.assign(document.createElement("canvas"), { width: 300, height: 100 });
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#c33";
        context.fillRect(0, 0, 150, 100);
        context.fillStyle = "#33c";
        context.fillRect(150, 0, 150, 100);
        return canvas.toDataURL("image/png");
      })
    ).split(",")[1],
    "base64",
  );
  await section.locator('input[type="file"]').first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: wide });
  const square = section.getByRole("group", { name: /Drag it, or use the arrow keys/ });
  await expect(square).toBeVisible();
  const photoIn = square.locator("img");
  const before = await photoIn.evaluate((img) => img.style.left);
  const box = (await square.boundingBox())!;
  await tech.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tech.mouse.down();
  await tech.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await tech.mouse.up();
  await expect.poll(() => photoIn.evaluate((img) => img.style.left)).not.toBe(before);
  await section.getByLabel("Zoom").fill("2");
  await expect.poll(() => photoIn.evaluate((img) => img.style.height)).toBe("200%");
  if (out) await section.screenshot({ path: `${out}/${info.project.name}_team-framing.png` });
  await section.getByRole("button", { name: "Use this photo" }).click();
  await expect(section.getByText("Photo ready. Save to put it on the card.")).toBeVisible();
  await expect(section.getByRole("img", { name: "Your photo" })).toBeVisible();
  if (out) await section.screenshot({ path: `${out}/${info.project.name}_team-settings.png` });
  await section.getByRole("button", { name: "Save developer and team" }).click();
  await expect(section.getByText("Developer and team saved.")).toBeVisible();
  await tech.goto("/p/team");
  await expect(tech.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/919876543210");
  // shown to everyone, like product photos
  const photo = tech.getByRole("img", { name: "Krish Modi" });
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  const guest = await browser.newContext();
  expect((await guest.request.get(new URL(src!, tech.url()).href)).status()).toBe(200);
  await guest.close();
  // the footer card leaves the team page alone, and carries the number everywhere else
  await expect(tech.getByRole("region", { name: "Developed by Krish Modi" })).toBeHidden();
  await tech.goto("/p");
  await expect(tech.getByRole("region", { name: "Developed by Krish Modi" }).getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await tech.context().close();
});

test("Staff shows who is a customer, who is staff, where to change a role, and lets an owner become Tech", async ({ browser }, info) => {
  const owner = await signedIn(browser, info, "owner");
  await owner.goto("/super-admin/staff");
  // someone without a staff role: a customer now, and nothing picked for them
  const shopper = owner.getByRole("row", { name: /Team Shopper/ });
  await expect(shopper.getByText("Customer", { exact: true })).toBeVisible();
  await expect(shopper.getByLabel("Role for Team Shopper")).toHaveValue("");
  // the team list: Change role for the others, never for yourself
  const team = owner.getByRole("table", { name: /Team accounts/ });
  await expect(team.getByRole("row", { name: /Team Tech/ }).getByRole("link", { name: "Change role" })).toBeVisible();
  await expect(team.getByRole("row", { name: /Team Owner/ }).getByRole("link", { name: "Change my role" })).toBeVisible();
  await team.getByRole("row", { name: /Team Tech/ }).getByRole("link", { name: "Change role" }).click();
  await expect(owner.locator("#edit").getByRole("heading", { name: "Team Tech" })).toBeVisible();
  // searching for someone already on the team, yourself included, says so
  await owner.goto(`/super-admin/staff?find=${PEOPLE.owner.phone}`);
  await expect(owner.getByText(/Already on the team: Team Owner \(you\) \(Owner\)/)).toBeVisible();
  if (out) await owner.screenshot({ path: `${out}/${info.project.name}_staff-search.png`, fullPage: true });
  // an owner can make themselves Tech, and Settings then shows the developer credits
  await owner.getByRole("table", { name: /Team accounts/ }).getByRole("link", { name: "Change my role" }).click();
  const mine = owner.locator("#edit");
  await mine.getByLabel("Your role").selectOption("tech");
  await mine.getByRole("button", { name: "Save my role" }).click();
  await expect(mine.getByText("You’re Tech now")).toBeVisible();
  await owner.goto("/super-admin#team");
  await expect(owner.locator("#team").getByRole("heading", { name: "Developer and team" })).toBeVisible();
  await owner.context().close();
});
