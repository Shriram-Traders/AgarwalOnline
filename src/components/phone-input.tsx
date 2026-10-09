"use client";
import type { FormEvent, InputHTMLAttributes } from "react";
import { tenDigitMobile } from "@/lib/auth/otp";

/**
 * A mobile-number box that only ever holds digits: letters are dropped as they're typed, and a
 * pasted "+91 98765 43210" or "09876543210" becomes 9876543210. No maxLength, because the browser
 * would cut a pasted "+91 …" short before the prefix could come off; trimming to ten happens here.
 */
export function PhoneInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      name="phone"
      type="tel"
      inputMode="numeric"
      pattern="[6-9][0-9]{9}"
      // the browser adds this to its "match the requested format" message
      title={props.placeholder ?? "10-digit mobile number"}
      {...props}
      onInput={(event) => {
        const box = event.currentTarget;
        const clean = tenDigitMobile(box.value);
        if (box.value !== clean) box.value = clean;
      }}
    />
  );
}

/** For six-digit code boxes: keeps the digits of whatever is typed or pasted ("123 456" → 123456). */
export function codeDigits(event: FormEvent<HTMLInputElement>) {
  const box = event.currentTarget;
  const clean = box.value.replace(/\D/g, "").slice(0, 6);
  if (box.value !== clean) box.value = clean;
}
