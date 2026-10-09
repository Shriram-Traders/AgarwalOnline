import { formatPrice } from "../display";
import type { Locale } from "../locale-types";
import { defaultRules } from "../commerce/delivery";
import { DEFAULT_TAX_PROFILE } from "../tax/gst";
import type { LegalFacts } from "./types";

const WEEKDAYS: Record<Locale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  mr: ["रविवार", "सोमवार", "मंगळवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
};

export const price = formatPrice;

/** "Monday–Saturday", "Monday, Wednesday", "Every day". */
export function daysText(days: number[], locale: Locale) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return locale === "mr" ? "दररोज" : "Every day";
  const consecutive = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);
  if (consecutive && sorted.length >= 3) return `${WEEKDAYS[locale][sorted[0]]}–${WEEKDAYS[locale][sorted.at(-1)!]}`;
  return sorted.map((day) => WEEKDAYS[locale][day]).join(", ");
}

/** "10 October 2026" / "10 ऑक्टोबर 2026", for a YYYY-MM-DD date. */
export function dateText(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "mr" ? "mr-IN-u-nu-latn" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The facts before the owner has saved anything: what a fresh shop would show. */
export const DEFAULT_FACTS: LegalFacts = {
  business: { legalName: DEFAULT_TAX_PROFILE.legalName, address: DEFAULT_TAX_PROFILE.address },
  cutoff: "3:00 PM",
  freeThresholdPaise: defaultRules.freeThresholdPaise,
  holidays: [],
  blackoutDates: [],
  areas: [],
  evidenceDays: 90,
  auditDays: 730,
};
