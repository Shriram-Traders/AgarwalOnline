import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rolesFor } from "../src/lib/auth/permissions";
import { isActiveHref, navFor, STAFF_NAV } from "../src/lib/staff/nav";
import { isStaffPath } from "../src/lib/staff/paths";

const groups = (role: Parameters<typeof rolesFor>[0]) => navFor(rolesFor(role)).map((group) => group.key);

describe("staff menu", () => {
  it("shows each role only the groups it can use", () => {
    expect(groups("super-admin")).toEqual(["today", "products", "customers", "money", "schools", "setup"]);
    expect(groups("admin")).toEqual(["today", "products", "customers", "money"]);
    expect(groups("delivery")).toEqual(["delivery"]);
    expect(groups(null)).toEqual([]);
    const money = navFor(rolesFor("admin")).find((group) => group.key === "money");
    expect(money?.items.map((item) => item.key)).toEqual(["cod", "analytics"]);
  });

  it("links only to pages that exist", () => {
    for (const item of STAFF_NAV.flatMap((group) => group.items))
      expect(existsSync(join(__dirname, "..", "src", "app", item.href, "page.tsx")), item.href).toBe(true);
  });

  it("highlights the page you're on", () => {
    const item = (key: string) => STAFF_NAV.flatMap((group) => group.items).find((entry) => entry.key === key)!;
    expect(isActiveHref(item("overview"), "/admin")).toBe(true);
    expect(isActiveHref(item("overview"), "/admin/orders/abc")).toBe(true);
    expect(isActiveHref(item("overview"), "/admin/customers")).toBe(false);
    expect(isActiveHref(item("catalog"), "/admin/inventory")).toBe(true);
    expect(isActiveHref(item("settings"), "/super-admin/staff")).toBe(false);
    expect(isActiveHref(item("deliveries"), "/delivery/orders/abc")).toBe(true);
  });

  it("knows a staff page from a shop page", () => {
    expect(isStaffPath("/admin")).toBe(true);
    expect(isStaffPath("/super-admin/schools/1")).toBe(true);
    expect(isStaffPath("/administrator")).toBe(false);
    expect(isStaffPath("/account")).toBe(false);
  });
});
