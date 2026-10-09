import { z } from "zod";

export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.");

/** What a typed or pasted number means: digits only, any +91 or leading 0 removed, at most ten. */
export function tenDigitMobile(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  // room for a +91 or 0 still being typed in front of the number, one key at a time
  return digits.slice(0, digits.startsWith("91") ? 12 : digits.startsWith("0") ? 11 : 10);
}
