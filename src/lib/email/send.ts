import nodemailer from "nodemailer";
import { getEnv } from "../env";
import { log } from "../logger";

export type Mail = { to: string; subject: string; html: string; text: string };

/** Accounts made by phone sign-up carry this placeholder until they add a real email. */
export const isPlaceholderEmail = (email: string | null | undefined) =>
  !email || email.endsWith("@phone.ags.invalid");

/** Emails can go out: the mailbox is configured, or this is local development (the email goes to the server log). */
export function emailEnabled() {
  const env = getEnv();
  return Boolean(env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM) || env.NODE_ENV !== "production";
}

/**
 * Sends from the shop's Hostinger mailbox over SMTP (sent mail lands in its Sent folder, replies in its
 * inbox). Without a mailbox, development prints the email (and its link) to the server log.
 */
export async function sendEmail(mail: Mail) {
  if (isPlaceholderEmail(mail.to)) return;
  const env = getEnv();
  if (!env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") throw new Error("Email service is not configured.");
    log("info", "email.dev-outbox", { to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  // one connection per email: serverless functions don't live long enough to keep a pool open
  const smtp = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  try {
    await smtp.sendMail({ from: env.EMAIL_FROM, ...mail });
  } catch (error) {
    log("error", "email.send-failed", { error });
    throw new Error("Unable to send the email. Please try again later.");
  }
}
