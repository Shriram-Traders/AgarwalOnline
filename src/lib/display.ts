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

/** The status fields an order carries, as stored. */
export type OrderStatusFields = {
  orderStatus: string;
  fulfilmentStatus?: string;
  deliveryStatus?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  codStatus?: string;
};
export type StageTone = "neutral" | "ok" | "warn" | "bad";
export type OrderStage = { key: string; label: string; tone: StageTone };

/**
 * One plain stage for an order, from its four status fields. Shown as four pills they read like
 * codes ("Order: Confirmed · Packing: Picking · Delivery: Assigned"). Staff wording; customers get
 * customerStage().
 */
export function orderStage(order: OrderStatusFields): OrderStage {
  const delivery = order.deliveryStatus ?? "unassigned";
  const fulfilment = order.fulfilmentStatus ?? "unassigned";
  if (delivery === "returned") return { key: "returned", label: "Returned to shop", tone: "bad" };
  if (order.orderStatus === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "bad" };
  if (order.orderStatus === "completed") return { key: "completed", label: "Completed", tone: "ok" };
  if (delivery === "delivered") return { key: "delivered", label: "Delivered", tone: "ok" };
  if (delivery === "failed") return { key: "failed", label: "Delivery failed", tone: "bad" };
  if (delivery === "attempted") return { key: "attempted", label: "Delivery attempted", tone: "warn" };
  if (delivery === "out-for-delivery") return { key: "out-for-delivery", label: "Out for delivery", tone: "warn" };
  if (delivery === "assigned") return { key: "with-rider", label: "With rider", tone: "warn" };
  if (order.orderStatus === "placed")
    return order.paymentMethod === "razorpay" && order.paymentStatus !== "paid"
      ? { key: "awaiting-payment", label: "Waiting for online payment", tone: "warn" }
      : { key: "to-confirm", label: "Waiting to confirm", tone: "warn" };
  if (fulfilment === "ready") return { key: "ready", label: "Packed – no rider", tone: "warn" };
  if (fulfilment === "packed") return { key: "packed", label: "Packed", tone: "warn" };
  if (fulfilment === "picking") return { key: "packing", label: "Being packed", tone: "warn" };
  return { key: "to-pack", label: "To pack", tone: "warn" };
}

const CUSTOMER_STAGES: Record<string, { en: string; mr: string }> = {
  "to-confirm": { en: "Order placed", mr: "ऑर्डर दिली" },
  "awaiting-payment": { en: "Waiting for online payment", mr: "ऑनलाइन पेमेंटची वाट" },
  "to-pack": { en: "Being packed", mr: "पॅक होत आहे" },
  packing: { en: "Being packed", mr: "पॅक होत आहे" },
  packed: { en: "Packed", mr: "पॅक झाले" },
  ready: { en: "Packed", mr: "पॅक झाले" },
  "with-rider": { en: "Packed", mr: "पॅक झाले" },
  "out-for-delivery": { en: "On the way", mr: "वाटेत आहे" },
  attempted: { en: "Delivery attempted", mr: "वितरणाचा प्रयत्न झाला" },
  failed: { en: "Delivery failed", mr: "वितरण होऊ शकले नाही" },
  delivered: { en: "Delivered", mr: "पोहोचवले" },
  completed: { en: "Delivered", mr: "पोहोचवले" },
  cancelled: { en: "Cancelled", mr: "रद्द" },
  returned: { en: "Cancelled – returned to the shop", mr: "रद्द – दुकानात परत" },
};
/** The same stage in the words a customer uses ("On the way", not "Out for delivery · assigned"). */
export function customerStage(order: OrderStatusFields, locale: "en" | "mr" = "en"): OrderStage {
  const stage = orderStage(order);
  return { ...stage, label: CUSTOMER_STAGES[stage.key]?.[locale] ?? stage.label };
}

/**
 * What the customer owes, in plain words. A cancelled order used to read "Payment: Pending" and
 * "Cash on Delivery · uncollected", as if money were still due. Display only: payment records
 * are not touched.
 */
export function paymentLabel(order: OrderStatusFields, locale: "en" | "mr" = "en") {
  const mr = locale === "mr";
  const cancelled = order.orderStatus === "cancelled";
  if (order.paymentMethod !== "razorpay") {
    if (cancelled) return mr ? "काही देणे नाही – ऑर्डर रद्द झाली" : "Nothing to pay – this order was cancelled";
    if (order.codStatus && order.codStatus !== "uncollected") return mr ? "रोख भरले" : "Paid in cash";
    return mr ? "वितरणावेळी रोख द्या" : "Pay cash on delivery";
  }
  switch (order.paymentStatus) {
    case "paid":
      return cancelled
        ? mr ? "ऑनलाइन भरले – परतावा दुकान करेल" : "Paid online – the store handles your refund"
        : mr ? "ऑनलाइन भरले" : "Paid online";
    case "refunded":
      return mr ? "पैसे परत केले" : "Refunded";
    case "partially-refunded":
      return mr ? "काही पैसे परत केले" : "Partly refunded";
    case "failed":
      return cancelled
        ? mr ? "पैसे घेतले नाहीत – ऑर्डर रद्द झाली" : "Not charged – this order was cancelled"
        : mr ? "ऑनलाइन पेमेंट अयशस्वी" : "Online payment failed";
    default:
      return cancelled
        ? mr ? "पैसे घेतले नाहीत – ऑर्डर रद्द झाली" : "Not charged – this order was cancelled"
        : mr ? "ऑनलाइन पेमेंटची वाट" : "Waiting for online payment";
  }
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
