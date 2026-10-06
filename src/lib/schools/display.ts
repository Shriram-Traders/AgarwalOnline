import type { Tone } from "@/components/status-pill";
import { isExpired } from "./quote-math";

type Status = "requested" | "quoted" | "changes-requested" | "accepted" | "closed";

/** What a quotation's state means to the school's representatives. */
export function repStatus(status: string, validUntil?: string): { label: string; tone: Tone } {
  switch (status as Status) {
    case "requested":
      return { label: "Waiting for prices", tone: "neutral" };
    case "quoted":
      return validUntil && isExpired(validUntil)
        ? { label: "Expired", tone: "bad" }
        : { label: "Quotation ready", tone: "warn" };
    case "changes-requested":
      return { label: "Changes asked", tone: "neutral" };
    case "accepted":
      return { label: "Accepted", tone: "ok" };
    default:
      return { label: "Closed", tone: "bad" };
  }
}

/** The same states from the owner's side of the desk. */
export function ownerStatus(status: string, validUntil?: string): { label: string; tone: Tone } {
  switch (status as Status) {
    case "requested":
      return { label: "To price", tone: "warn" };
    case "quoted":
      return validUntil && isExpired(validUntil)
        ? { label: "Sent, expired", tone: "bad" }
        : { label: "Sent, waiting", tone: "neutral" };
    case "changes-requested":
      return { label: "Changes asked", tone: "warn" };
    case "accepted":
      return { label: "Accepted", tone: "ok" };
    default:
      return { label: "Closed", tone: "bad" };
  }
}

/** "Expected ₹45 + GST (18%)", or the honest "Price on quotation". */
export function expectedPrice(schoolPricePaise: number | undefined, gstRatePercent: number | undefined, format: (paise: number) => string) {
  if (schoolPricePaise == null) return "Price on quotation";
  return `Expected ${format(schoolPricePaise)} + GST${gstRatePercent != null ? ` (${gstRatePercent}%)` : ""}`;
}

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Paise as "₹1,234.50": a quotation always shows the paise column, like a bill. */
export const quoteMoney = (paise: number) => rupees.format(paise / 100);

/** "2026-10-17" as "17 Oct 2026". */
export const quoteDate = (day: string) =>
  new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
