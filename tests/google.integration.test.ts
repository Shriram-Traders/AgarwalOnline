import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { makeSignature } from "better-auth/crypto";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { CartLine, Order } from "../src/lib/commerce/models";
import { getAuth, sessionUserId } from "../src/lib/auth/better-auth";
import { absorbBlocker, absorbGoogleAccount } from "../src/lib/auth/merge";
import { sendEmail } from "../src/lib/email/send";
import { createEmailVerificationToken } from "better-auth/api";
import { AuditLog } from "../src/lib/db/models";

const uri = process.env.TEST_MONGODB_URI;
const origin = "http://127.0.0.1:3000";
const CLIENT_ID = "test-google-client.apps.googleusercontent.com";

/** The identity Google's token endpoint will vouch for next. Only Google's server is faked. */
let googleIdentity = { sub: "", email: "", name: "" };
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const realFetch = globalThis.fetch;
/** Emails handed to Resend during the test (only Resend's server is faked). */
const sentMail: { from: string; to: string[]; subject: string; text: string; html: string }[] = [];

describe.skipIf(!uri)("Google sign-in keeps a customer's data", () => {
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw new Error("Tests require a dedicated ags_test database");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: origin,
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
      MOCK_OTP_CODE: "246810",
      GOOGLE_CLIENT_ID: CLIENT_ID,
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Agarwal General Stores <orders@example.test>",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://api.resend.com/emails") {
        sentMail.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "email-test" });
      }
      if (!url.startsWith("https://oauth2.googleapis.com/token")) return realFetch(input, init);
      const now = Math.floor(Date.now() / 1000);
      const idToken = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: googleIdentity.sub,
        email: googleIdentity.email,
        email_verified: true,
        name: googleIdentity.name,
        iat: now,
        exp: now + 3600,
      })}.signature`;
      return Response.json({ access_token: "access", id_token: idToken, expires_in: 3600, token_type: "Bearer", scope: "openid email profile" });
    });
    await connectDB();
    await mongoose.connection.dropDatabase();
    await User.syncIndexes();
  });
  beforeEach(async () => {
    for (const name of ["users", "authAccounts", "authSessions", "authVerifications", "authRateLimits", "orders", "cartlines", "auditlogs", "ratelimits"])
      await mongoose.connection.collection(name).deleteMany({});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const cookiesFrom = (headers: Headers) =>
    headers.getSetCookie().map((cookie) => cookie.split(";")[0]).filter((pair) => !pair.endsWith("="));

  /** The full redirect flow: our sign-in call, then Google's redirect back to the callback. */
  async function googleSignIn(identity: typeof googleIdentity, extraCookies: string[] = [], link = false) {
    googleIdentity = identity;
    const started = link
      ? await getAuth().api.linkSocialAccount({
          body: { provider: "google", callbackURL: "/account?google=linked", errorCallbackURL: "/account", disableRedirect: true },
          headers: new Headers({ origin, cookie: extraCookies.join("; ") }),
          returnHeaders: true,
        })
      : await getAuth().api.signInSocial({
          body: {
            provider: "google",
            callbackURL: "/auth/continue",
            newUserCallbackURL: "/auth/continue?new=1",
            errorCallbackURL: "/login",
            disableRedirect: true,
          },
          headers: new Headers({ origin }),
          returnHeaders: true,
        });
    const url = new URL(started.response.url!);
    expect(url.host).toBe("accounts.google.com");
    const state = url.searchParams.get("state")!;
    const response = await getAuth().handler(
      new Request(`${origin}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`, {
        headers: { cookie: [...cookiesFrom(started.headers), ...extraCookies].join("; ") },
      }),
    );
    const location = response.headers.get("location") ?? "";
    const session = cookiesFrom(response.headers).find((pair) => pair.startsWith("ags_session="));
    const userId = session ? await sessionUserId(new Headers({ cookie: session })) : null;
    return { location, userId, session };
  }

  /** The normal sign-up: phone OTP, then name and email saved as the sign-up form does (email unverified). */
  async function normalSignUp(phone: string, email: string) {
    const headers = new Headers({ origin });
    await getAuth().api.sendPhoneNumberOTP({ body: { phoneNumber: phone }, headers });
    const { user } = await getAuth().api.verifyPhoneNumber({ body: { phoneNumber: phone, code: "246810" }, headers });
    await User.updateOne({ _id: user.id }, { $set: { name: "Shopper", email } });
    await Order.collection.insertOne({ customerId: new mongoose.Types.ObjectId(user.id), number: `AGS-T-${phone}`, totalPaise: 49900, createdAt: new Date() });
    await mongoose.connection.collection("authSessions").deleteMany({ userId: new mongoose.Types.ObjectId(user.id) }); // signed out
    return user.id as string;
  }
  async function sessionCookieFor(userId: string) {
    const ctx = await getAuth().$context;
    const { token } = await ctx.internalAdapter.createSession(userId);
    return `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
  }
  const ordersOf = (userId: string) => Order.countDocuments({ customerId: new mongoose.Types.ObjectId(userId) });

  it("same email: Google never creates a second account; one connect step later it opens the original account", async () => {
    const shopper = await normalSignUp("9000000051", "shopper@gmail.test");
    const google = { sub: "google-sub-1", email: "shopper@gmail.test", name: "Shopper G" };

    const first = await googleSignIn(google);
    expect(first.location).toContain("/login?error=account_not_linked");
    expect(first.userId).toBeNull();
    expect(await User.countDocuments()).toBe(1);
    expect(await ordersOf(shopper)).toBe(1);

    // the guided path: signed in to the original account, they connect Google
    const linked = await googleSignIn(google, [await sessionCookieFor(shopper)], true);
    expect(linked.location).toContain("/account?google=linked");

    const again = await googleSignIn(google);
    expect(again.location).toBe("/auth/continue");
    expect(again.userId).toBe(shopper);
    expect(await User.countDocuments()).toBe(1);
    expect(await ordersOf(shopper)).toBe(1);
  });

  it("different Gmail: the new Google account folds into the original once the mobile number is verified", async () => {
    const shopper = await normalSignUp("9000000052", "typed-at-signup@example.test");
    const google = { sub: "google-sub-2", email: "someone.else@gmail.test", name: "Shopper G" };

    const first = await googleSignIn(google);
    expect(first.location).toBe("/auth/continue?new=1");
    const fresh = first.userId!;
    expect(fresh).not.toBe(shopper);
    expect(await ordersOf(fresh)).toBe(0);
    await CartLine.collection.insertOne({ customerId: new mongoose.Types.ObjectId(fresh), variantId: new mongoose.Types.ObjectId(), quantity: 2, createdAt: new Date(), updatedAt: new Date() });

    expect(await absorbBlocker(fresh, shopper)).toBeNull();
    await absorbGoogleAccount(fresh, shopper);
    expect(await User.exists({ _id: fresh })).toBeNull();
    expect(await CartLine.countDocuments({ customerId: new mongoose.Types.ObjectId(shopper) })).toBe(1);

    const again = await googleSignIn(google);
    expect(again.location).toBe("/auth/continue");
    expect(again.userId).toBe(shopper);
    expect(await ordersOf(shopper)).toBe(1);
    expect(await User.countDocuments()).toBe(1);
  });

  it("never folds away a Google account that already has orders", async () => {
    const shopper = await normalSignUp("9000000053", "a@example.test");
    const first = await googleSignIn({ sub: "google-sub-3", email: "b@gmail.test", name: "B" });
    await Order.collection.insertOne({ customerId: new mongoose.Types.ObjectId(first.userId!), number: "AGS-T-G", totalPaise: 100, createdAt: new Date() });
    expect(await absorbBlocker(first.userId!, shopper)).toMatch(/already has its own orders/);
    await expect(absorbGoogleAccount(first.userId!, shopper)).rejects.toThrow(/already has its own orders/);
    expect(await User.countDocuments()).toBe(2);
  });

  it("a verified email (like the owner's) signs straight in to the existing account", async () => {
    const owner = await User.create({ name: "Owner", email: "owner@gmail.test", emailVerified: true, phone: "9000000054", roles: ["customer", "super-admin"] });
    const signedIn = await googleSignIn({ sub: "google-sub-4", email: "owner@gmail.test", name: "Owner G" });
    expect(signedIn.location).toBe("/auth/continue");
    expect(signedIn.userId).toBe(String(owner._id));
    expect(await User.countDocuments()).toBe(1);
  });

  it("sends the confirmation email through Resend, and its link confirms the address", async () => {
    sentMail.length = 0;
    const shopper = await normalSignUp("9000000055", "confirm.me@gmail.test");
    await getAuth().api.sendVerificationEmail({
      body: { email: "confirm.me@gmail.test", callbackURL: "/auth/email-verified" },
      headers: new Headers({ origin }),
    });
    expect(sentMail).toHaveLength(1);
    const [mail] = sentMail;
    expect(mail.to).toEqual(["confirm.me@gmail.test"]);
    expect(mail.from).toBe("Agarwal General Stores <orders@example.test>");
    expect(mail.subject).toBe("Confirm your email for Agarwal General Stores");
    const link = mail.text.match(/https?:\/\/\S+/)![0];
    expect(link.startsWith(`${origin}/api/auth/verify-email?token=`)).toBe(true);
    expect(mail.html).toContain("Confirm my email");

    const response = await getAuth().handler(new Request(link));
    expect(response.headers.get("location")).toBe("/auth/email-verified");
    expect((await User.findById(shopper))?.emailVerified).toBe(true);
    expect(await AuditLog.exists({ action: "auth.email.verified", target: shopper })).toBeTruthy();

    // with the email confirmed, Google opens the same account directly: no extra step, no second account
    const signedIn = await googleSignIn({ sub: "google-sub-5", email: "confirm.me@gmail.test", name: "Confirm Me" });
    expect(signedIn.location).toBe("/auth/continue");
    expect(signedIn.userId).toBe(shopper);
    expect(await User.countDocuments()).toBe(1);
    expect(await ordersOf(shopper)).toBe(1);
  });

  it("reports an expired confirmation link and leaves the email unconfirmed", async () => {
    const shopper = await normalSignUp("9000000056", "late@gmail.test");
    const ctx = await getAuth().$context;
    const token = await createEmailVerificationToken(ctx.secret, "late@gmail.test", undefined, -60);
    const response = await getAuth().handler(
      new Request(`${origin}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/auth/email-verified")}`),
    );
    expect(response.headers.get("location")).toBe("/auth/email-verified?error=TOKEN_EXPIRED");
    expect((await User.findById(shopper))?.emailVerified).toBe(false);
  });

  it("never emails the placeholder address a phone-only account carries", async () => {
    sentMail.length = 0;
    await sendEmail({ to: "9000000057@phone.ags.invalid", subject: "x", html: "x", text: "x" });
    expect(sentMail).toHaveLength(0);
  });
});

