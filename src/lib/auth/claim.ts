import "server-only";
import { headers } from "next/headers";
import { User } from "../db/models";
import { getAuth } from "./better-auth";
import { absorbBlocker } from "./merge";
import { rateLimit } from "./rate-limit";
import { digest } from "./crypto";

/**
 * Sends a sign-in code so a phone-less account (made with Google) can take `phone` as its sign-in
 * number. If the number already belongs to another account, first checks that this account can be
 * folded into it. Used by the account page and by the address form's "also use to sign in" box.
 */
export async function sendClaimCode(
  userId: string,
  phone: string,
): Promise<{ newAccount: boolean } | { error: string }> {
  await rateLimit(`otp:${digest(phone)}`, 3);
  const existing = await User.findOne({ phone });
  if (existing && !existing.active)
    return { error: "This account is not active. Please contact the store." };
  if (existing) {
    const blocker = await absorbBlocker(userId, String(existing._id));
    if (blocker) return { error: blocker };
  }
  await getAuth().api.sendPhoneNumberOTP({
    body: { phoneNumber: phone },
    headers: await headers(),
  });
  return { newAccount: !existing };
}
