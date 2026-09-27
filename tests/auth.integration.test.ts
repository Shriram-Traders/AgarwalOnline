import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { getAuth, sessionUserId } from "../src/lib/auth/better-auth";
import { makeSignature } from "better-auth/crypto";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Better Auth MongoDB integration", () => {
  const requestHeaders = new Headers({
    origin: "http://127.0.0.1:3000",
    "x-forwarded-for": "127.0.0.42",
  });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test"))
      throw new Error("Tests require a dedicated ags_test database");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
      MOCK_OTP_CODE: "246810",
      GOOGLE_CLIENT_ID: "test-google-client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
    });
    await connectDB();
    await User.init();
    await User.syncIndexes();
  });

  beforeEach(async () => {
    for (const name of [
      "users",
      "authSessions",
      "authAccounts",
      "authVerifications",
      "authRateLimits",
    ])
      await mongoose.connection.collection(name).deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const send = (phone = "9000000091") =>
    getAuth().api.sendPhoneNumberOTP({
      body: { phoneNumber: phone },
      headers: requestHeaders,
    });
  const verify = (code = "246810", phone = "9000000091") =>
    getAuth().api.verifyPhoneNumber({
      body: { phoneNumber: phone, code },
      headers: requestHeaders,
    });

  it("creates a customer and a database session only after OTP verification", async () => {
    await send();
    expect(await User.countDocuments()).toBe(0);
    const result = await verify();
    expect(result.user).toBeTruthy();
    const customer = await User.findOne({ roles: ["customer"], active: true });
    expect(customer?.phone).toBe("9000000091");
    expect(
      await mongoose.connection.collection("authSessions").countDocuments(),
    ).toBe(1);
    await expect(verify()).rejects.toThrow();
  });

  it("locks a mock challenge after five invalid attempts", async () => {
    await send();
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(verify("111111")).rejects.toThrow();
    await expect(verify()).rejects.toThrow();
  });

  it("allows only one concurrent successful OTP consumption", async () => {
    await send();
    const results = await Promise.allSettled([verify(), verify()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });

  it("signs staff in through the same phone flow with the same 7-day session", async () => {
    await User.create({
      name: "Fictional Admin",
      email: "admin@example.test",
      emailVerified: true,
      phone: "9000000091",
      roles: ["customer", "admin"],
      active: true,
    });
    await send();
    const result = await verify();
    expect(result.user).toBeTruthy();
    const session = await mongoose.connection
      .collection("authSessions")
      .findOne({ userId: (await User.findOne({ phone: "9000000091" }))!._id });
    const days = (session!.expiresAt.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("keeps a staff session past 12 hours: there is no separate staff limit", async () => {
    const staff = await User.create({
      name: "Night Admin",
      email: "night@example.test",
      phone: "9000000092",
      roles: ["customer", "admin"],
    });
    const ctx = await getAuth().$context;
    const { token } = await ctx.internalAdapter.createSession(String(staff._id));
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
    const headers = new Headers({ cookie });
    expect(await sessionUserId(headers)).toBe(String(staff._id));
    await mongoose.connection.collection("authSessions").updateOne(
      { token },
      { $set: { createdAt: new Date(Date.now() - 13 * 3600000) } },
    );
    expect(await sessionUserId(headers)).toBe(String(staff._id));
  });

  it("creates Google accounts as customers without a phone, and allows more than one", async () => {
    const ctx = await getAuth().$context;
    for (const [i, email] of ["first@gmail.test", "second@gmail.test"].entries()) {
      const { user } = await ctx.internalAdapter.createOAuthUser(
        { name: `Google Person ${i}`, email, emailVerified: true, image: null },
        { providerId: "google", accountId: `google-sub-${i}` },
      );
      const stored = await User.findById(user.id).lean<{ roles: string[]; active: boolean; phone?: string }>();
      expect(stored?.roles).toEqual(["customer"]);
      expect(stored?.active).toBe(true);
      expect(stored?.phone).toBeUndefined();
      const { token } = await ctx.internalAdapter.createSession(user.id);
      const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
      expect(await sessionUserId(new Headers({ cookie }))).toBe(user.id);
    }
    // a phone number, once set, is still unique
    await User.create({ name: "A", phone: "9000000095", roles: ["customer"] });
    await expect(User.create({ name: "B", phone: "9000000095", roles: ["customer"] })).rejects.toThrow(/duplicate key/);
  });

  it("links Google only to accounts whose email is verified, and lets a signed-in person connect Google", async () => {
    const ctx = await getAuth().$context;
    expect(ctx.socialProviders.map((provider) => provider.id)).toContain("google");
    // read as the general option type: the inferred literal type omits the defaults being checked
    const linking = ctx.options.account?.accountLinking as
      | { enabled?: boolean; requireLocalEmailVerified?: boolean; disableImplicitLinking?: boolean; allowDifferentEmails?: boolean }
      | undefined;
    expect(linking?.enabled).toBe(true);
    // default true: an unverified local email never inherits a Google sign-in
    expect(linking?.requireLocalEmailVerified ?? true).toBe(true);
    expect(linking?.disableImplicitLinking ?? false).toBe(false);
    expect(ctx.trustedProviders).toEqual([]);
    expect(linking?.allowDifferentEmails).toBe(true);
  });

  it("refuses the phone flow for a paused account", async () => {
    await User.create({
      name: "Paused",
      phone: "9000000091",
      roles: ["customer"],
      active: false,
    });
    await expect(send()).rejects.toThrow("not active");
  });

  it("uses Better Auth rate limits for repeated OTP sends", async () => {
    const request = () =>
      getAuth().handler(
        new Request("http://127.0.0.1:3000/api/auth/phone-number/send-otp", {
          method: "POST",
          headers: {
            ...Object.fromEntries(requestHeaders),
            "content-type": "application/json",
          },
          body: JSON.stringify({ phoneNumber: "9000000091" }),
        }),
      );
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });
});
