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
  "delivery.reassign": "Changed the rider",
  "delivery.retry": "Put a failed delivery back for another try",
  "delivery.unassign": "Took an order off its rider",
  "inventory.adjust": "Adjusted stock",
  "kit.publish": "Published a school kit",
  "kit.save": "Saved a school kit",
  "kit.unpublish": "Paused a school kit",
  "tab.approve": "Opened a family tab",
  "tab.close": "Closed a family tab",
  "tab.limit": "Changed a family tab limit",
  "tab.pause": "Paused a family tab",
  "tab.payment": "Recorded a family tab payment",
  "tab.payment.void": "Voided a family tab payment",
  "tab.request": "Asked for a family tab",
  "tab.resume": "Reopened a family tab",
  "inventory.threshold.update": "Changed the stock approval limit",
  "order.cancel": "Cancelled an order",
  "order.return-to-shop": "Closed an order as returned to shop",
  "packing.adjust": "Changed an order to what was packed",
  "packing.checklist": "Saved a packing checklist",
  "product.metadata.update": "Edited product details",
  "product.audience": "Changed who sees a product",
  "product.show": "Showed a product in the shop",
  "product.hide": "Hid a product",
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
  "variant.update": "Changed a pack",
  "variant.school-price": "Set a school price",
  "tax-details.update": "Changed the business and tax details",
  "school.create": "Added a school",
  "school.update": "Changed a school's details",
  "school.pause": "Paused a school",
  "school.resume": "Resumed a school",
  "school.link.reset": "Made a new school join link",
  "school.link.open": "Let a school's join link work",
  "school.link.close": "Stopped a school's join link",
  "school.member.add": "Added a school representative",
  "school.member.remove": "Removed a school representative",
  "school.access.request": "Asked to represent a school",
  "school.access.withdraw": "Withdrew a school access request",
  "school.access.approve": "Approved school access",
  "school.access.decline": "Declined school access",
  "quote.request": "Asked for a school quotation",
  "quote.draft.save": "Saved a quotation draft",
  "quote.send": "Sent a school quotation",
  "quote.accept": "Accepted a quotation",
  "quote.changes": "Asked for changes to a quotation",
  "quote.close": "Closed a quotation request",
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
  orders: { label: "Orders & delivery", prefixes: ["order.", "delivery.", "packing.", "cod.", "evidence.", "complaint.", "return."] },
  catalog: { label: "Catalog & stock", prefixes: ["product.", "variant.", "category.", "inventory.", "approval.", "review.", "kit."] },
  money: { label: "Offers & refunds", prefixes: ["promotion.", "refund.", "payment.", "tab."] },
  schools: { label: "Schools & quotations", prefixes: ["school.", "quote."] },
  team: {
    label: "Team & settings",
    prefixes: ["staff.", "service-area.", "delivery-rules.", "delivery-slot.", "search-synonym.", "profile.", "tax-details."],
  },
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;
