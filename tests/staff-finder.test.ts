import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grants, rolesFor, type Permission } from "../src/lib/auth/permissions";
import { findInWorkspace, recordShortcuts } from "../src/lib/staff/finder";
import { FINDER_INDEX } from "../src/lib/staff/search-index";

const owner = rolesFor("super-admin");
const admin = rolesFor("admin");
const rider = rolesFor("delivery");
const ids = (query: string, roles = owner, locale: "en" | "mr" = "en") =>
  findInWorkspace(query, { roles, locale }).flatMap((group) => group.hits.map((hit) => hit.id));

describe("workspace search", () => {
  it("finds a setting by its own words, a typo and Marathi", () => {
    expect(ids("free delivery")[0]).toBe("settings.free-delivery");
    expect(ids("delivry fee")).toContain("settings.delivery-fee");
    expect(ids("मोफत", owner, "mr")).toContain("settings.free-delivery");
    expect(ids("sunday")).toContain("settings.weekly-holiday");
    expect(ids("cod limit")[0]).toBe("settings.cod-limit");
    expect(ids("gst")).toEqual(expect.arrayContaining(["settings.gstin", "settings.gst-rate"]));
  });

  it("only offers what the person may open", () => {
    expect(ids("gstin", admin)).not.toContain("settings.gstin");
    expect(ids("coupon", admin)).not.toContain("action.create-offer");
    expect(ids("stock", admin)).toContain("action.adjust-stock");
    const riderIds = ids("", rider);
    expect(riderIds).toContain("page.deliveries");
    expect(riderIds).not.toContain("page.overview");
    expect(ids("orders", rider).some((id) => id.startsWith("record."))).toBe(false);
  });

  it("puts the order shortcut first for an order number, and customers too for a phone", () => {
    const order = findInWorkspace("AGS-20261003", { roles: owner, locale: "en" });
    expect(order[0].kind).toBe("record");
    expect(order[0].hits.map((hit) => hit.href)).toEqual(["/admin?q=AGS-20261003#orders"]);
    const phone = recordShortcuts("+91 98765 43210", owner, "en");
    expect(phone.priority).toBe(true);
    expect(phone.hits.map((hit) => hit.href)).toEqual([
      "/admin?q=9876543210#orders",
      "/admin/customers?q=9876543210",
    ]);
    const words = findInWorkspace("priya", { roles: owner, locale: "en" });
    expect(words.map((group) => group.kind)).toEqual(["record"]);
    expect(findInWorkspace("free delivery", { roles: owner, locale: "en" }).some((group) => group.kind === "record")).toBe(false);
  });

  it("lists the main pages before anything is typed, and caps the list", () => {
    const empty = findInWorkspace("", { roles: owner, locale: "en" });
    expect(empty).toHaveLength(1);
    expect(empty[0].kind).toBe("goto");
    expect(empty[0].hits[0].href).toBe("/admin");
    expect(ids("order").length).toBeLessThanOrEqual(12);
  });

  it("has Marathi for every entry and only real permissions", () => {
    const known = new Set<string>(Object.values(grants).flat());
    for (const entry of FINDER_INDEX) {
      expect(entry.title.mr, entry.id).toBeTruthy();
      if (entry.hint) expect(entry.hint.mr, entry.id).toBeTruthy();
      expect(known.has(entry.permission as Permission), entry.id).toBe(true);
    }
    expect(new Set(FINDER_INDEX.map((entry) => entry.id)).size).toBe(FINDER_INDEX.length);
  });

  it("links only to pages and anchors that exist", () => {
    const app = join(__dirname, "..", "src", "app");
    const sourceOf = (path: string) => {
      const dir = join(app, path);
      const files = [join(dir, "page.tsx")];
      const local = join(dir, "_settings");
      if (existsSync(local)) files.push(...readdirSync(local).map((file) => join(local, file)));
      return files.filter(existsSync).map((file) => readFileSync(file, "utf8")).join("\n");
    };
    for (const entry of FINDER_INDEX) {
      const url = new URL(entry.href, "http://shop.test");
      const source = sourceOf(url.pathname);
      expect(source, `${entry.id}: ${url.pathname}`).not.toBe("");
      if (url.hash) expect(source, `${entry.id}: ${entry.href}`).toContain(`id="${url.hash.slice(1)}"`);
    }
  });
});
