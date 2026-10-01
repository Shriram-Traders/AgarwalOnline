import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/lib/env";
import { hasPermission, assertPermission } from "../src/lib/auth/permissions";
import { digest, otpDigest, equalHash, token } from "../src/lib/auth/crypto";
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
  it("treats blank optional values, as .env.example ships them, as not set", () => {
    const blank = Object.fromEntries(
      [
        "BETTER_AUTH_SECRET",
        "CRON_SECRET",
        "MOCK_OTP",
        "MOCK_OTP_CODE",
        "ALLOW_MOCK_OTP_IN_PRODUCTION",
        "SMS_API_URL",
        "SMS_API_TOKEN",
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
});
