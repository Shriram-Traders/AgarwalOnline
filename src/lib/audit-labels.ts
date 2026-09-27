/** What each audit code means, in the words an owner would use. The code itself stays visible next to it. */
const LABELS: Record<string, string> = {
  "auth.customer.email_login": "Signed in with email",
  "auth.customer.login": "Signed in with a one-time code",
  "auth.customer.password_login": "Signed in with mobile number and password",
  "auth.google.login": "Signed in with Google",
  "auth.google.merge": "Linked a Google account",
  "category.create": "Added an aisle",
  "category.update": "Changed an aisle",
  "cod.discrepancy.resolve": "Resolved a cash difference",
  "cod.reconcile": "Recorded a cash handover",
  "complaint.create": "Raised a complaint",
  "complaint.update": "Updated a complaint",
  "delivery-rules.update": "Changed the delivery rules",
  "delivery-slot.create": "Added a delivery slot",
  "inventory.adjust": "Adjusted stock",
  "inventory.threshold.update": "Changed the stock approval limit",
  "packing.checklist": "Saved a packing checklist",
  "product.metadata.update": "Edited product details",
  "profile.phone.add": "Added a mobile number",
  "profile.update": "Updated their profile",
  "promotion.create": "Created an offer",
  "promotion.pause": "Paused an offer",
  "promotion.publish": "Switched an offer on",
  "refund.failed": "A refund failed",
  "refund.processed": "Processed a refund",
  "refund.requested": "Requested a refund",
  "return.update": "Updated a return",
  "search-synonym.update": "Changed search words",
  "service-area.update": "Changed a service area",
  "staff.create": "Created a staff account",
  "staff.grant": "Gave someone a staff role",
  "staff.update": "Changed a staff account",
  "variant.create": "Added a pack size",
};
const PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^approval\.publish\.(.+)$/, (m) => `Published an approved ${m[1]} change`],
  [/^evidence\.(.+)\.upload$/, (m) => `Uploaded a ${m[1].replaceAll("-", " ")} photo`],
  [/^review\.(.+)$/, (m) => `Marked a review as ${m[1].replaceAll("-", " ")}`],
];

export function auditLabel(action: string) {
  if (LABELS[action]) return LABELS[action];
  for (const [pattern, describe] of PATTERNS) {
    const match = action.match(pattern);
    if (match) return describe(match);
  }
  const words = action.replace(/[._-]+/g, " ").trim();
  return words[0]?.toUpperCase() + words.slice(1);
}

/** Groups for the audit filter, by code prefix. */
export const AUDIT_GROUPS = {
  "sign-ins": { label: "Sign-ins", prefixes: ["auth."] },
  orders: { label: "Orders & delivery", prefixes: ["packing.", "cod.", "evidence.", "complaint.", "return."] },
  catalog: { label: "Catalog & stock", prefixes: ["product.", "variant.", "category.", "inventory.", "approval.", "review."] },
  money: { label: "Offers & refunds", prefixes: ["promotion.", "refund.", "payment."] },
  team: {
    label: "Team & settings",
    prefixes: ["staff.", "service-area.", "delivery-rules.", "delivery-slot.", "search-synonym.", "profile."],
  },
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;
