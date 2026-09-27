import { getEnv } from "../env";
import { log } from "../logger";

export type Mail = { to: string; subject: string; html: string; text: string };

/** Accounts made by phone sign-up carry this placeholder until they add a real email. */
export const isPlaceholderEmail = (email: string | null | undefined) =>
  !email || email.endsWith("@phone.ags.invalid");

/** Emails can go out: Resend is configured, or this is local development (the email goes to the server log). */
export function emailEnabled() {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) || env.NODE_ENV !== "production";
}

/** Sends through Resend's REST API. Without Resend, development prints the email (and its link) to the server log. */
export async function sendEmail(mail: Mail) {
  if (isPlaceholderEmail(mail.to)) return;
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") throw new Error("Email service is not configured.");
    log("info", "email.dev-outbox", { to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((error: unknown) => {
    log("error", "email.send-failed", { error });
    return null;
  });
  if (!response?.ok) {
    if (response)
      log("error", "email.send-failed", {
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
    throw new Error("Unable to send the email. Please try again later.");
  }
}
