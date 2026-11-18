import { afterEach, describe, expect, it } from "vitest";
import { deliveryCode } from "../src/lib/operations/delivery-code";

const real = { ...process.env };
const env = (extra: Record<string, string>) =>
  Object.assign(process.env, {
    MONGODB_URI: "mongodb://localhost/test",
    APP_ORIGIN: "https://example.test",
    AUTH_SECRET: "a".repeat(32),
    MOCK_OTP: "false",
    ...extra,
  });

describe("an order's delivery code", () => {
  afterEach(() => {
    process.env = { ...real };
  });
  it("is the same six digits every time for one order", () => {
    env({});
    const code = deliveryCode("665f000000000000000000aa");
    expect(code).toMatch(/^\d{6}$/);
    expect(deliveryCode("665f000000000000000000aa")).toBe(code);
  });
  it("differs from order to order, and with another secret", () => {
    env({});
    const one = deliveryCode("665f000000000000000000aa");
    expect(deliveryCode("665f000000000000000000ab")).not.toBe(one);
    env({ AUTH_SECRET: "b".repeat(32) });
    expect(deliveryCode("665f000000000000000000aa")).not.toBe(one);
  });
  it("is the test code when codes are mocked", () => {
    env({ MOCK_OTP: "true", MOCK_OTP_CODE: "246810" });
    expect(deliveryCode("665f000000000000000000aa")).toBe("246810");
  });
});
