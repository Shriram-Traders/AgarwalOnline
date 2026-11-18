import { createHmac } from "node:crypto";
import { getEnv } from "../env";

/**
 * An order's delivery code: the same six digits on the customer's order page, in the WhatsApp or SMS
 * MiniMoth sends, on every resend and at the door. It is worked out from the order and the server's
 * secret each time, so nothing is stored and nobody without the secret can work it out.
 */
export function deliveryCode(orderId: string) {
  const env = getEnv();
  if (env.MOCK_OTP === "true") return env.MOCK_OTP_CODE;
  const digest = createHmac("sha256", env.AUTH_SECRET).update(`delivery-code:${orderId}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
