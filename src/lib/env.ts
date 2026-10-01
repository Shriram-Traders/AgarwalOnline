import { z } from "zod";
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    MONGODB_URI: z.string().startsWith("mongodb"),
    // Browsers send Origin without a path or trailing slash, so compare against the bare origin.
    APP_ORIGIN: z
      .string()
      .url()
      .transform((value) => new URL(value).origin),
    AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    MOCK_OTP: z.enum(["true", "false"]).default("false"),
    // Pre-launch escape hatch: lets a test deployment on Vercel (which always runs in production mode) use mock OTP.
    ALLOW_MOCK_OTP_IN_PRODUCTION: z.enum(["true", "false"]).default("false"),
    MOCK_OTP_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .default("246810"),
    CRON_SECRET: z.string().min(16).optional(),
    // Resend for email verification; both blank sends nothing in production and logs emails in development
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    // Google sign-in; both blank hides the button
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SMS_API_URL: z.string().optional(),
    SMS_API_TOKEN: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    EVIDENCE_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(7)
      .max(3650)
      .default(90),
    AUDIT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(90)
      .max(3650)
      .default(730),
  })
  .superRefine((env, ctx) => {
    // Owner decision (2026-09-23): the pre-launch test site may use any code, including 000000.
    // Anyone who knows the code can sign in as any phone number, so remove the flag before launch.
    if (
      env.NODE_ENV === "production" &&
      env.MOCK_OTP === "true" &&
      env.ALLOW_MOCK_OTP_IN_PRODUCTION !== "true"
    )
      ctx.addIssue({
        code: "custom",
        message: "Mock OTP is forbidden in production",
        path: ["MOCK_OTP"],
      });
    if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
      ctx.addIssue({
        code: "custom",
        message: "Production requires HTTPS",
        path: ["APP_ORIGIN"],
      });
    if (Boolean(env.RESEND_API_KEY) !== Boolean(env.EMAIL_FROM))
      ctx.addIssue({
        code: "custom",
        message: "Resend API key and sender address must be configured together",
        path: ["RESEND_API_KEY"],
      });
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET))
      ctx.addIssue({
        code: "custom",
        message: "Google client ID and secret must be configured together",
        path: ["GOOGLE_CLIENT_ID"],
      });
    if (Boolean(env.SMS_API_URL) !== Boolean(env.SMS_API_TOKEN))
      ctx.addIssue({
        code: "custom",
        message: "SMS URL and token must be configured together",
        path: ["SMS_API_URL"],
      });
    const cloudinary = [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ].filter(Boolean);
    if (cloudinary.length > 0 && cloudinary.length < 3)
      ctx.addIssue({
        code: "custom",
        message: "All Cloudinary credentials are required",
        path: ["CLOUDINARY_CLOUD_NAME"],
      });
  });
export function parseEnv(source: Record<string, string | undefined>) {
  // `KEY=` (as .env.example ships its optional values) means "not set", not "an empty value":
  // blank CRON_SECRET, BETTER_AUTH_SECRET or retention days used to stop the app from starting
  const set = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value?.trim()),
  );
  return schema.parse(set);
}
export function getEnv() {
  return parseEnv(process.env);
}
export function databaseConfigured() {
  return Boolean(process.env.MONGODB_URI);
}
