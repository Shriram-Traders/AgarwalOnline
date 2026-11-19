"use server";
import mongoose from "mongoose";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuditLog, User } from "../db/models";
import { getEnv } from "../env";
import { connectDB } from "../db/connect";
import { phoneSchema } from "./otp";
import { getAuth } from "./better-auth";
import {
  ensureStaffCredential,
  hashStaffPassword,
  upsertCredential,
} from "./staff-credentials";
import { rateLimit } from "./rate-limit";
import { digest } from "./crypto";
import { log } from "../logger";
import { isAllowedOrigin } from "./origin";
import { staffHome, type Role } from "./permissions";
import { returnPath } from "../return-path";
import { currentUser } from "./session";
import { absorbBlocker, absorbGoogleAccount } from "./merge";
import { sendClaimCode } from "./claim";
import { isPlaceholderEmail } from "../email/send";
import type { MutationState } from "../commerce/actions";
export type AuthState = {
  error?: string;
  challengeId?: string;
  phone?: string;
  email?: string;
  newAccount?: boolean;
  /** What the person typed in the first box: a mobile number or an email address. */
  by?: "phone" | "email";
  /** After the first box: an account with a password (sign in), a new one, or one with no password yet ("set"). */
  step?: "password" | "new" | "set";
};
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(180);
/** The box the person filled: `by=email` reads the email, anything else the mobile number. */
function identity(form: FormData) {
  return form.get("by") === "email"
    ? { by: "email" as const, email: emailSchema.parse(form.get("email")) }
    : { by: "phone" as const, phone: phoneSchema.parse(form.get("phone")) };
}
type Who = ReturnType<typeof identity>;
const keyOf = (who: Who) => (who.by === "email" ? who.email : who.phone);
const findBy = (who: Who) => User.findOne(who.by === "email" ? { email: who.email } : { phone: who.phone });
/** Signs in with a password: a credential record, or a staff password not yet moved into one. */
async function hasPassword(userId: unknown) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const credential = await mongoose.connection
    .collection("authAccounts")
    .findOne({ userId: id, providerId: "credential" }, { projection: { password: 1 } });
  if (credential?.password) return true;
  return Boolean((await User.findById(id).select("+passwordHash"))?.passwordHash);
}
async function checkOrigin() {
  const origin = (await headers()).get("origin");
  if (!isAllowedOrigin(origin, getEnv().APP_ORIGIN))
    throw new Error("Invalid request origin.");
}
function safeError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  const message = error instanceof Error ? error.message : "";
  if (
    /^(Too many|Invalid email|Invalid.*(?:code|OTP)|This code|This account|SMS service|Unable to send)/i.test(
      message,
    )
  )
    return message;
  log("error", "auth.unexpected-error", { error });
  return "Unable to sign in. Please try again later.";
}
/** Staff go straight to their workspace; everyone else to the account, or the basket when a guest basket was merged. */
/** Customers land in the shop (not their profile) after signing in; staff land in their workspace. */
function landing(roles: readonly Role[], mergedBasket: boolean) {
  return mergedBasket ? "/cart" : (staffHome(roles) ?? "/");
}
/**
 * Sign-in that started from "Continue with Google" on an existing email finishes by connecting Google;
 * one that started from a shared-list link goes back to that list.
 */
function afterSignIn(form: FormData, target: string) {
  if (form.get("then") === "connect-google") return "/account?connect=google";
  // back to where they started: checkout, a product, a shared list…
  return returnPath(form.get("then")) ?? target;
}
export async function customerPasswordLoginAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/";
  try {
    await checkOrigin();
    await connectDB();
    const input = z
      .object({
        phone: phoneSchema,
        password: z.string().min(1).max(128),
      })
      .parse(Object.fromEntries(form));
    await rateLimit(`customer-password:${digest(input.phone)}`, 5);
    const user = await User.findOne({ phone: input.phone, active: true });
    if (!user)
      return { error: "Invalid mobile number or password.", phone: input.phone };
    try {
      await getAuth().api.signInPhoneNumber({
        body: { phoneNumber: input.phone, password: input.password },
        headers: await headers(),
      });
    } catch {
      return { error: "Invalid mobile number or password.", phone: input.phone };
    }
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(String(user._id));
    target = afterSignIn(form, landing(user.roles as Role[], merged.added > 0));
    await AuditLog.create({ actorId: user._id, action: "auth.customer.password_login" });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
export async function customerEmailLoginAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/";
  try {
    await checkOrigin();
    await connectDB();
    const input = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(1).max(128),
      })
      .parse(Object.fromEntries(form));
    await rateLimit(`customer-email:${digest(input.email)}`, 5);
    const user = await User.findOne({ email: input.email, active: true });
    if (!user) return { error: "Invalid email or password.", email: input.email };
    try {
      await ensureStaffCredential(String(user._id));
      await getAuth().api.signInEmail({
        body: { email: input.email, password: input.password },
        headers: await headers(),
      });
    } catch {
      return { error: "Invalid email or password.", email: input.email };
    }
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(String(user._id));
    target = afterSignIn(form, landing(user.roles as Role[], merged.added > 0));
    await AuditLog.create({ actorId: user._id, action: "auth.customer.email_login" });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
/**
 * The first box: is there an account for this mobile number or email? One with a password goes on to
 * the password; a new one, or one never given a password (made with Google, say), goes on to a code.
 * The answer never says whose account it is. Asked as soon as a whole number or email is typed.
 */
export async function identifyAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  try {
    await checkOrigin();
    await connectDB();
    const who = identity(form);
    // per network: people fix a digit and look again, but this is not a lookup service
    const network = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    await rateLimit(`identify:${digest(network)}`, 60);
    const user = await findBy(who);
    if (user && !user.active) return { ...who, error: "This account is not active. Please contact the store." };
    const step = !user ? "new" : (await hasPassword(user._id)) ? "password" : "set";
    return { ...who, step, newAccount: !user };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function sendOTPAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  try {
    await checkOrigin();
    await connectDB();
    // a mobile number gets its code on WhatsApp (or SMS), an email address by email; one is enough
    const who = identity(form);
    // a code goes out only to create an account or to set a new password; signing in is by password
    const intent = z.enum(["signup", "reset"]).parse(form.get("intent"));
    await rateLimit(`otp:${digest(keyOf(who))}`, 3);
    const existing = await findBy(who);
    if (existing && !existing.active)
      throw new Error("This account is not active. Please contact the store.");
    const what = who.by === "email" ? "email" : "number";
    if (intent === "signup" && existing)
      return { ...who, error: `An account already exists for this ${what}. Sign in instead.` };
    if (intent === "reset" && !existing)
      return { ...who, error: `No account found for this ${what}. Create an account first.` };
    if (who.by === "email") {
      await getAuth().api.sendVerificationOTP({
        body: { email: who.email, type: "sign-in" },
        headers: await headers(),
      });
    } else {
      if (existing && !existing.email)
        await User.updateOne(
          { _id: existing._id },
          {
            $set: {
              email: `${who.phone}@phone.ags.invalid`,
              emailVerified: false,
            },
          },
        );
      await getAuth().api.sendPhoneNumberOTP({
        body: { phoneNumber: who.phone },
        headers: await headers(),
      });
    }
    return { ...who, challengeId: "better-auth", newAccount: !existing };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function verifyOTPAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/";
  try {
    await checkOrigin();
    await connectDB();
    const who = identity(form);
    const code = z
      .string()
      .regex(/^\d{6}$/, "Enter the 6-digit code.")
      .parse(form.get("code"));
    const nameValue = form.get("name");
    const name = nameValue
      ? z.string().trim().min(2).max(80).parse(nameValue)
      : undefined;
    const existingBeforeVerification = await findBy(who);
    // a code never signs in on its own: a new account and a reset both set the password
    const password = z.string().min(8).max(128).parse(form.get("password"));
    // the client blocks a mismatch, but the client is not the authority
    if (form.get("confirmPassword") !== password)
      return { error: "Passwords do not match." };
    await rateLimit(`verify:${digest(keyOf(who))}`, 10);
    const verifying = new Date();
    // the code makes the account (or proves it's theirs); an email code also confirms the email
    const userId =
      who.by === "email"
        ? (
            await getAuth()
              .api.signInEmailOTP({
                body: { email: who.email, otp: code, ...(name ? { name } : {}) },
                headers: await headers(),
              })
              .catch(() => {
                throw new Error("Invalid or expired code.");
              })
          ).user.id
        : (
            await getAuth().api.verifyPhoneNumber({
              body: { phoneNumber: who.phone, code },
              headers: await headers(),
            })
          ).user?.id;
    if (!userId) throw new Error("Invalid or expired code.");
    if (name) await User.updateOne({ _id: userId }, { $set: { name } });
    await upsertCredential(userId, await hashStaffPassword(password));
    // a reset signs every other device out, so whoever knew the old password is out too
    if (existingBeforeVerification)
      await mongoose.connection
        .collection("authSessions")
        .deleteMany({ userId: existingBeforeVerification._id, createdAt: { $lt: verifying } });
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(userId);
    const signedIn = await User.findById(userId).select("roles");
    target = afterSignIn(form, landing((signedIn?.roles ?? []) as Role[], merged.added > 0));
    await AuditLog.create({
      actorId: userId,
      action: existingBeforeVerification ? "auth.customer.password_reset" : "auth.customer.login",
      details: { by: who.by },
    });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
/** Starts Google sign-in. Better Auth sets its state cookie through nextCookies(); we then follow its URL. */
export async function googleSignInAction() {
  await checkOrigin();
  const { url } = await getAuth().api.signInSocial({
    body: {
      provider: "google",
      callbackURL: "/auth/continue",
      newUserCallbackURL: "/auth/continue?new=1",
      errorCallbackURL: "/login",
      disableRedirect: true,
    },
    headers: await headers(),
  });
  if (!url) throw new Error("Google sign-in is unavailable.");
  redirect(url);
}
/** Connects Google to the signed-in account, so it can be used to sign in next time. */
export async function linkGoogleAction() {
  await checkOrigin();
  const { url } = await getAuth().api.linkSocialAccount({
    body: {
      provider: "google",
      callbackURL: "/account?google=linked",
      errorCallbackURL: "/account",
      disableRedirect: true,
    },
    headers: await headers(),
  });
  redirect(url);
}
/**
 * Step 1 of "Ordered with us before?" for someone who joined with Google: sends a code to the
 * mobile number. If that number already has an account, it is checked up front that the fresh
 * Google account can be folded into it.
 */
export async function claimPhoneSendAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  try {
    await checkOrigin();
    const user = await currentUser();
    if (!user) return { error: "Please sign in again." };
    if (user.phone) return { error: "Your account already has a mobile number." };
    const phone = phoneSchema.parse(form.get("phone"));
    const sent = await sendClaimCode(user.id, phone);
    if ("error" in sent) return { error: sent.error, phone };
    return { phone, challengeId: "better-auth", newAccount: sent.newAccount };
  } catch (error) {
    return { error: safeError(error) };
  }
}
/**
 * Step 2: checks the code. A number nobody uses is added to this account. A number that belongs
 * to an existing account signs the person into that account and moves their Google sign-in there,
 * so their earlier orders are what they see from now on.
 */
export async function claimPhoneVerifyAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/account?phone=added";
  try {
    await checkOrigin();
    const user = await currentUser();
    if (!user) return { error: "Please sign in again." };
    const phone = phoneSchema.parse(form.get("phone"));
    const code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.").parse(form.get("code"));
    await rateLimit(`verify:${digest(phone)}`, 10);
    const existing = await User.findOne({ phone });
    if (!existing) {
      await getAuth().api.verifyPhoneNumber({
        body: { phoneNumber: phone, code, updatePhoneNumber: true },
        headers: await headers(),
      });
      await AuditLog.create({ actorId: user.id, action: "profile.phone.add", target: user.id });
    } else {
      const blocker = await absorbBlocker(user.id, String(existing._id));
      if (blocker) return { error: blocker, phone };
      // signs in as the existing account (this replaces the Google-only session cookie)
      await getAuth().api.verifyPhoneNumber({
        body: { phoneNumber: phone, code },
        headers: await headers(),
      });
      await absorbGoogleAccount(user.id, String(existing._id));
      target = "/account?google=merged";
    }
  } catch (error) {
    return { error: safeError(error), phone: String(form.get("phone") ?? "") };
  }
  redirect(target);
}
/** "Send verification email" on the account page. */
export async function resendVerificationAction(): Promise<MutationState> {
  try {
    await checkOrigin();
    const user = await currentUser();
    if (!user) return { error: "Please sign in again." };
    const account = await User.findById(user.id).select("email emailVerified");
    if (!account?.email || isPlaceholderEmail(account.email))
      return { error: "Your account has no email address yet." };
    if (account.emailVerified) return { success: "Your email is already confirmed." };
    await rateLimit(`verify-email:${digest(account.email)}`, 3);
    await getAuth().api.sendVerificationEmail({
      body: { email: account.email, callbackURL: "/auth/email-verified" },
      headers: await headers(),
    });
    return { success: `We sent a confirmation link to ${account.email}. It works for 24 hours.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Too many|Unable to send)/.test(message)) return { error: message };
    log("error", "auth.verification-email-failed", { error });
    return { error: "Unable to send the email. Please try again later." };
  }
}
export async function logoutAction() {
  await checkOrigin();
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
