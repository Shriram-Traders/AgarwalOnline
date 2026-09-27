import type { z } from "zod";

/** Field names as the people filling the forms know them. */
const LABELS: Record<string, string> = {
  pricePaise: "Price",
  mrpPaise: "MRP",
  feePaise: "Delivery fee",
  codLimitPaise: "Largest cash-on-delivery order",
  freeThresholdPaise: "Free delivery amount",
  minimumSubtotalPaise: "Minimum basket",
  maximumDiscountPaise: "Maximum discount",
  amountPaise: "Refund amount",
  cashPaise: "Cash collected",
  receivedPaise: "Cash received",
  discountValue: "Discount",
  discountType: "Discount type",
  cutoffHour: "Cutoff hour",
  blackoutDates: "Closed dates",
  holidays: "Weekly holidays",
  pincodes: "PIN codes",
  pin: "PIN code",
  nameEn: "English name",
  nameMr: "Marathi name",
  descriptionEn: "English description",
  descriptionMr: "Marathi description",
  highlightsEn: "English highlights",
  highlightsMr: "Marathi highlights",
  slug: "Web address",
  sku: "SKU",
  label: "Pack label",
  packQuantity: "Pack quantity",
  maxQuantity: "Purchase limit",
  stock: "Opening stock",
  delta: "Quantity change",
  packedQuantity: "Packed quantity",
  capacity: "Orders it can take",
  threshold: "Units",
  startsAt: "Start",
  endsAt: "End",
  phone: "Mobile number",
  email: "Email address",
  line: "Address",
  code: "Code",
  rating: "Rating",
  body: "Message",
  terms: "Words",
  images: "Image links",
  categoryId: "Category",
  productId: "Product",
  variantId: "Pack",
  partnerId: "Delivery partner",
};

function labelFor(key: string) {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/Paise$/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "A value";
}

/** Limits on paise fields are shown in rupees, because that is what staff type. */
function amount(key: string, value: number | bigint) {
  return key.endsWith("Paise")
    ? `₹${(Number(value) / 100).toLocaleString("en-IN")}`
    : Number(value).toLocaleString("en-IN");
}

/**
 * Zod's own wording ("Too small: expected number to be >0") in plain English
 * that names the field. Messages a schema spells out itself pass through.
 */
export function plainMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!/^(Too (small|big)|Invalid|Unrecognized)/.test(issue.message)) return issue.message;
  const key = String(issue.path.at(-1) ?? "");
  const what = labelFor(key);
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") return `${what} needs at least ${issue.minimum} characters.`;
      if (issue.origin === "array" || issue.origin === "set") return `${what} needs at least ${issue.minimum}.`;
      return `${what} must be ${issue.inclusive ? "at least" : "more than"} ${amount(key, issue.minimum)}.`;
    case "too_big":
      if (issue.origin === "string") return `${what} can be at most ${issue.maximum} characters.`;
      if (issue.origin === "array" || issue.origin === "set") return `${what} can have at most ${issue.maximum}.`;
      return `${what} must be ${issue.inclusive ? "at most" : "less than"} ${amount(key, issue.maximum)}.`;
    case "invalid_type":
      if (!("received" in issue) || issue.received === "undefined") return `${what} is required.`;
      if (issue.expected === "date") return `${what} must be a date.`;
      if (issue.expected === "number" || issue.expected === "int") return `${what} must be a number.`;
      return `${what} is not valid.`;
    case "invalid_format":
      return issue.format === "email" ? "Enter a valid email address." : `${what} is not in the right format.`;
    case "invalid_value":
      return `Choose ${what.toLowerCase()} from the list.`;
    default:
      return `${what} is not valid.`;
  }
}
