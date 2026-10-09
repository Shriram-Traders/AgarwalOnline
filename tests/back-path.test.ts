import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOME_PATHS, parentPath } from "../src/lib/back-path";

/** Every page route in src/app, with dynamic segments filled with a sample value. */
function pageRoutes(dir = "src/app", base = ""): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "api") continue;
      routes.push(...pageRoutes(path, `${base}/${name.startsWith("[") ? "sample" : name}`));
    } else if (name === "page.tsx") routes.push(base || "/");
  }
  return routes;
}

describe("Back when there is no earlier page of the shop", () => {
  it("goes to the natural parent of a detail page", () => {
    expect(parentPath("/products/blue-gel-pen")).toBe("/catalog");
    expect(parentPath("/checkout")).toBe("/cart");
    expect(parentPath("/account/orders/66f0c0ffee")).toBe("/account/orders");
    expect(parentPath("/account/lists/66f0c0ffee")).toBe("/account/wishlist");
    expect(parentPath("/admin/orders/66f0c0ffee")).toBe("/admin");
    expect(parentPath("/delivery/orders/66f0c0ffee")).toBe("/delivery");
    expect(parentPath("/lists/shared-token")).toBe("/");
    expect(parentPath("/q/quotation-link-code-0001")).toBe("/");
  });

  it("otherwise goes one level up, and never past the home page", () => {
    expect(parentPath("/account/addresses")).toBe("/account");
    expect(parentPath("/account")).toBe("/");
    expect(parentPath("/cart")).toBe("/");
    expect(parentPath("/super-admin/staff")).toBe("/super-admin");
  });

  it("always lands on a page that exists", () => {
    const pages = new Set(pageRoutes().map((route) => route.replace(/\/sample(?=\/|$)/g, "/[x]")));
    const exists = (path: string) => pages.has(path) || pages.has(path.replace(/\/[^/]+$/, "/[x]"));
    for (const route of pageRoutes()) {
      if (HOME_PATHS.has(route)) continue;
      const parent = parentPath(route);
      expect(exists(parent), `${route} → ${parent}`).toBe(true);
    }
  });
});
