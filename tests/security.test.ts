import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/lib/env";
import { hasPermission, assertPermission, pickedRole, rolesFor, staffHome, staffRoleOf } from "../src/lib/auth/permissions";
import { digest, otpDigest, equalHash, token } from "../src/lib/auth/crypto";
import { tenDigitMobile } from "../src/lib/auth/otp";
const env = {
  MONGODB_URI: "mongodb://localhost/test",
  APP_ORIGIN: "https://example.test",
  AUTH_SECRET: "a".repeat(32),
};
describe("security boundaries", () => {
  it("forbids mock authentication in production", () => {
    expect(() =>
      parseEnv({ ...env, NODE_ENV: "production", MOCK_OTP: "true" }),
    ).toThrow();
  });
  it("allows mock OTP in production only with the opt-in flag", () => {
    const prod = { ...env, NODE_ENV: "production", MOCK_OTP: "true", MOCK_OTP_CODE: "000000" };
    expect(() => parseEnv(prod)).toThrow();
    expect(parseEnv({ ...prod, ALLOW_MOCK_OTP_IN_PRODUCTION: "true" }).MOCK_OTP_CODE).toBe("000000");
  });
  it("needs the whole mailbox to send email, but a leftover sender alone still starts", () => {
    const from = { EMAIL_FROM: "Agarwal <orders@example.test>" };
    expect(() => parseEnv({ ...env, ...from, SMTP_USER: "orders@example.test" })).toThrow("configured together");
    expect(parseEnv({ ...env, ...from }).EMAIL_FROM).toBe(from.EMAIL_FROM);
    expect(parseEnv({ ...env, ...from, SMTP_USER: "orders@example.test", SMTP_PASS: "x" }).SMTP_PASS).toBe("x");
  });
  it("lets only a G-… Measurement ID into the analytics script tag", () => {
    expect(parseEnv({ ...env, GA_MEASUREMENT_ID: "G-N74DJNS842" }).GA_MEASUREMENT_ID).toBe("G-N74DJNS842");
    expect(parseEnv({ ...env, GA_MEASUREMENT_ID: "" }).GA_MEASUREMENT_ID).toBeUndefined();
    for (const bad of ["UA-12345-1", "G-1');alert(1)//", "g-n74djns842"])
      expect(() => parseEnv({ ...env, GA_MEASUREMENT_ID: bad })).toThrow();
  });
  it("treats blank optional values, as .env.example ships them, as not set", () => {
    const blank = Object.fromEntries(
      [
        "BETTER_AUTH_SECRET",
        "CRON_SECRET",
        "MOCK_OTP",
        "MOCK_OTP_CODE",
        "ALLOW_MOCK_OTP_IN_PRODUCTION",
        "MINIMOTH_HOOK_URL",
        "MINIMOTH_HOOK_TOKEN",
        "CLOUDINARY_CLOUD_NAME",
        "EVIDENCE_RETENTION_DAYS",
        "AUDIT_RETENTION_DAYS",
      ].map((key) => [key, ""]),
    );
    const parsed = parseEnv({ ...env, ...blank });
    expect(parsed.CRON_SECRET).toBeUndefined();
    expect(parsed.BETTER_AUTH_SECRET).toBeUndefined();
    expect(parsed.EVIDENCE_RETENTION_DAYS).toBe(90);
    expect(parsed.MOCK_OTP).toBe("false");
    // required values still have to be really there
    expect(() => parseEnv({ ...env, AUTH_SECRET: "" })).toThrow();
  });
  it("reduces APP_ORIGIN to a bare origin", () => {
    expect(parseEnv({ ...env, APP_ORIGIN: "https://example.test/" }).APP_ORIGIN).toBe("https://example.test");
    expect(parseEnv({ ...env, APP_ORIGIN: "https://example.test/shop?x=1" }).APP_ORIGIN).toBe("https://example.test");
  });
  it("requires secure production origin and secret", () => {
    expect(() =>
      parseEnv({
        ...env,
        NODE_ENV: "production",
        APP_ORIGIN: "http://example.test",
      }),
    ).toThrow();
    expect(() => parseEnv({ ...env, AUTH_SECRET: "short" })).toThrow();
    expect(() => parseEnv({ ...env, BETTER_AUTH_SECRET: "short" })).toThrow();
  });
  it("denies customer and delivery access to operations", () => {
    expect(hasPermission(["customer"], "order:manage")).toBe(false);
    expect(hasPermission(["customer", "delivery"], "analytics:read")).toBe(false);
    expect(() => assertPermission(["customer", "admin"], "settings:write")).toThrow(
      "FORBIDDEN",
    );
    expect(hasPermission(["customer", "super-admin"], "settings:write")).toBe(true);
    // a staff member keeps every customer permission
    expect(hasPermission(["customer", "admin"], "cart:own")).toBe(true);
  });
  it("gives Tech everything an owner has, plus the site's own settings", () => {
    const tech = rolesFor("tech");
    expect(tech).toEqual(["customer", "super-admin", "tech"]);
    expect(hasPermission(tech, "settings:write")).toBe(true);
    expect(hasPermission(tech, "staff:manage")).toBe(true);
    expect(hasPermission(tech, "tech:write")).toBe(true);
    // an owner can't change the developer credits
    expect(hasPermission(["customer", "super-admin"], "tech:write")).toBe(false);
    // Tech works in the owner's workspace, and the Staff page names the role
    expect(staffRoleOf(tech)).toBe("super-admin");
    expect(staffHome(tech)).toBe("/admin");
    expect(pickedRole(tech)).toBe("tech");
    expect(pickedRole(["customer", "admin"])).toBe("admin");
  });
  it("separates OTP subjects and uses opaque high-entropy session tokens", () => {
    expect(
      equalHash(
        otpDigest("a", "123456", "secret"),
        otpDigest("b", "123456", "secret"),
      ),
    ).toBe(false);
    const a = token();
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(token());
    expect(digest(a)).not.toBe(a);
  });
  it("reads a typed or pasted mobile number as ten digits", () => {
    expect(tenDigitMobile("98765abc43210")).toBe("9876543210");
    expect(tenDigitMobile("+91 98765 43210")).toBe("9876543210");
    expect(tenDigitMobile("09876543210")).toBe("9876543210");
    expect(tenDigitMobile("9876543210 1")).toBe("9876543210");
    // typed one key at a time, "+91 " plus the number still ends as the ten digits
    let typed = "";
    for (const key of "+91 98765 43210") typed = tenDigitMobile(typed + key);
    expect(typed).toBe("9876543210");
    // a number that starts with 91 keeps it
    expect(tenDigitMobile("9123456789")).toBe("9123456789");
  });
});
