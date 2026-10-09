import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../src/app/manifest";

/** A PNG's width and height, from its header. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("Install as an app", () => {
  const app = manifest();

  it("gives Chrome what it needs to offer Install", () => {
    expect(app).toMatchObject({ name: "Agarwal General Stores", short_name: "Agarwal", start_url: "/", display: "standalone" });
    const sizes = app.icons!.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(app.icons!.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
  });

  it("lists only icons that exist, at the size it says", () => {
    for (const icon of app.icons!) {
      const file = `public${icon.src}`;
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(file), file).toBe(icon.sizes);
    }
    expect(pngSize("src/app/apple-icon.png")).toBe("180x180");
  });

  it("keeps the service worker away from sign-in and from caching the shop", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    const untouched = new RegExp(worker.match(/const UNTOUCHED = \/(.+)\/;/)![1]);
    for (const path of ["/login", "/signup", "/staff/login", "/api/auth/callback/google", "/auth/verify"])
      expect(untouched.test(path), path).toBe(true);
    for (const path of ["/", "/catalog", "/cart", "/account/orders", "/loginx"]) expect(untouched.test(path), path).toBe(false);
    // the only thing it ever stores is the offline notice
    expect(worker.match(/cache\.add\w*\(/g)).toEqual(["cache.add("]);
    expect(worker).not.toMatch(/cache\.put|navigationPreload\.enable/);
  });
});
