import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getEnv } from "../env";
import { mongoClient } from "../db/connect";
import { originVariants } from "./origin";
import { sendLoginCode } from "./sms";
import { sendEmail } from "../email/send";
import { verificationEmail } from "../email/templates";

type AuthInstance = ReturnType<typeof buildAuth>;
const instances = new Map<string, AuthInstance>();
const mockChallenges = new Map<
  string,
  { expiresAt: number; attempts: number }
>();

function objectId(value: string): ObjectId {
  return new ObjectId(value);
}

function buildAuth() {
  const env = getEnv();
  // the same pool Mongoose uses: one set of Atlas connections per server, not two
  const client = mongoClient(env.MONGODB_URI);
  const db = client.db();

  return betterAuth({
    appName: "AGARWAL GENERAL STORES",
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET,
    trustedOrigins: originVariants(env.APP_ORIGIN),
    database: mongodbAdapter(db, { client, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: (password) => bcrypt.hash(password, 12),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              prompt: "select_account" as const,
            },
          },
        }
      : {}),
    emailVerification: {
      // a signed 24-hour link; clicking it only confirms the email and never signs anyone in
      expiresIn: 24 * 60 * 60,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, ...verificationEmail(user.name, url) });
      },
      afterEmailVerification: async (user) => {
        await db.collection("auditlogs").insertOne({
          actorId: objectId(user.id),
          action: "auth.email.verified",
          target: user.id,
          at: new Date(),
        });
      },
    },
    account: {
      modelName: "authAccounts",
      accountLinking: {
        enabled: true,
        // Signing in with Google joins an existing account only when that account's email is verified
        // (requireLocalEmailVerified, the default), so nobody can pre-register someone else's email and
        // inherit their Google sign-in. A signed-in person can still connect Google from the account page,
        // whatever email the account holds, because they have already proved they own it.
        allowDifferentEmails: true,
      },
    },
    user: {
      modelName: "users",
      additionalFields: {
        // everyone is a customer; staff carry one extra role, granted only from the Super Admin page
        roles: {
          type: "string[]",
          required: true,
          defaultValue: ["customer"],
          input: false,
        },
        active: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        locale: {
          type: ["en", "mr"],
          required: true,
          defaultValue: "en",
        },
      },
    },
    session: {
      modelName: "authSessions",
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 12 * 60 * 60,
    },
    verification: {
      modelName: "authVerifications",
      storeIdentifier: "hashed",
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimits",
      window: 60,
      max: 100,
      customRules: {
        "/phone-number/send-otp": { window: 60, max: 3 },
        "/phone-number/verify": { window: 60, max: 10 },
        "/sign-in/phone-number": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookies: {
        session_token: {
          name: "ags_session",
          attributes: { sameSite: "lax", httpOnly: true, path: "/" },
        },
      },
      database: { generateId: false, joins: true },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db.collection("users").findOne({
              _id: objectId(session.userId),
              active: true,
            });
            if (!user) return false;
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/phone-number/send-otp" ||
          ctx.path === "/phone-number/verify" ||
          ctx.path === "/sign-in/phone-number"
        ) {
          const phone = String(ctx.body?.phoneNumber ?? "");
          const user = await db.collection("users").findOne({ phone });
          if (user && user.active !== true)
            throw new APIError("FORBIDDEN", {
              message: "This account is not active. Please contact the store.",
            });
          if (user && !user.email)
            await db.collection("users").updateOne(
              { _id: user._id },
              {
                $set: {
                  email: `${phone}@phone.ags.invalid`,
                  emailVerified: false,
                },
              },
            );
        }
        if (ctx.path === "/sign-in/email") {
          const email = String(ctx.body?.email ?? "").toLowerCase();
          const user = await db.collection("users").findOne({ email });
          if (!user || user.active !== true)
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid email or password.",
            });
        }
      }),
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 5,
        phoneNumberValidator: (phone) => /^[6-9]\d{9}$/.test(phone),
        sendOTP: async ({ phoneNumber, code }) => {
          if (env.MOCK_OTP === "true") {
            mockChallenges.set(phoneNumber, {
              expiresAt: Date.now() + 5 * 60 * 1000,
              attempts: 0,
            });
            return;
          }
          await sendLoginCode(phoneNumber, code);
        },
        ...(env.MOCK_OTP === "true"
          ? {
              verifyOTP: ({ phoneNumber, code }) => {
                const challenge = mockChallenges.get(phoneNumber);
                if (
                  !challenge ||
                  challenge.expiresAt <= Date.now() ||
                  challenge.attempts >= 5
                ) {
                  mockChallenges.delete(phoneNumber);
                  return false;
                }
                challenge.attempts += 1;
                if (code !== env.MOCK_OTP_CODE) return false;
                mockChallenges.delete(phoneNumber);
                return true;
              },
            }
          : {}),
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone}@phone.ags.invalid`,
          getTempName: () => "Neighbour",
        },
        schema: {
          user: {
            fields: {
              phoneNumber: "phone",
              phoneNumberVerified: "phoneVerified",
            },
          },
        },
      }),
      nextCookies(),
    ],
    telemetry: { enabled: false },
  });
}

/** Everyone, staff included, stays signed in for the 30-day session; deactivating a user still ends it on the next request. */
export async function sessionUserId(headers: Headers): Promise<string | null> {
  const found = await getAuth().api.getSession({ headers });
  return found?.user.id ?? null;
}

/** True when Google sign-in is configured; the buttons only appear then. */
export function googleEnabled() {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function getAuth() {
  const env = getEnv();
  // Google credentials are part of the key, so adding them to .env takes effect without a restart
  const key = `${env.MONGODB_URI}|${env.APP_ORIGIN}|${env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET}|${env.GOOGLE_CLIENT_ID ?? ""}`;
  let auth = instances.get(key);
  if (!auth) {
    auth = buildAuth();
    instances.set(key, auth);
  }
  return auth;
}
