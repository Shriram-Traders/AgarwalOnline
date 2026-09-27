const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Paise → "₹1,234.5" (no trailing zeros, Indian digit grouping). */
export function formatPrice(paise: number) {
  return inr.format(paise / 100);
}

/** A rupee amount typed into a staff form ("499" or "499.50") as whole paise; undefined when left blank. */
export function paiseFromRupees(value: FormDataEntryValue | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const rupees = Number(text);
  return Number.isFinite(rupees) ? Math.round(rupees * 100) : Number.NaN;
}
/** Form fields for staff, with every `somethingRupees` input handed on as `somethingPaise`. */
export function formWithPaise(form: FormData) {
  const fields: Record<string, FormDataEntryValue | number | undefined> = {};
  for (const [key, value] of form)
    if (key.endsWith("Rupees")) fields[key.replace(/Rupees$/, "Paise")] = paiseFromRupees(value);
    else fields[key] = value;
  return fields;
}

/** "just now", "12 min ago", "3 h ago", "2 days ago", then the date; pair it with `formatIst` in a title. */
export function timeAgo(date: Date | string, now: Date = new Date()) {
  const then = new Date(date);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)} days ago`;
  return then.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
}

/** Whole-number discount percentage, 0 when there is no saving. */
export function discountPercent(pricePaise: number, mrpPaise: number) {
  return mrpPaise > pricePaise
    ? Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100)
    : 0;
}

export function displayStatus(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Minutes left before the same-day cutoff, in the store's timezone (IST).
 * Negative once the cutoff has passed. Server and client agree because both
 * read the wall clock in Asia/Kolkata rather than the host timezone.
 */
export function minutesUntilCutoff(cutoffHour: number, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const at = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return cutoffHour * 60 - (at("hour") * 60 + at("minute"));
}

/** 134 → "2h 14m" / "2 ता 14 मि", 45 → "45m" / "45 मि". */
export function formatDuration(minutes: number, locale: "en" | "mr" = "en") {
  const whole = Math.max(0, minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const [h, m] = locale === "mr" ? [" ता", " मि"] : ["h", "m"];
  return hours ? `${hours}${h} ${rest}${m}` : `${whole}${m}`;
}

/** The store's wall clock. Replaces the same toLocaleString call copied across nine files. */
export function formatIst(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...options,
  });
}
