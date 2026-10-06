/**
 * The fixed parts of order feedback: the tags a shopper can pick, which pages the "How did we
 * do?" popup may open on, and how long an order stays open to rating. Pure, so the popup, the
 * server and the tests all read the same rules.
 */

/** Shown for 4 or 5 stars: "What did you like?" */
export const LIKED_TAGS = ["on-time", "well-packed", "right-items", "good-quality", "polite-partner", "easy-order"] as const;
/** Shown for 1 to 3 stars: "What went wrong?" */
export const WRONG_TAGS = [
  "late",
  "item-missing",
  "wrong-item",
  "damaged-item",
  "poor-quality",
  "rude-partner",
  "hard-order",
] as const;
export const FEEDBACK_TAGS = [...LIKED_TAGS, ...WRONG_TAGS] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

export const tagsFor = (rating: number): readonly FeedbackTag[] => (rating >= 4 ? LIKED_TAGS : WRONG_TAGS);

/** Only tags that belong to this rating's set, each once: a 5-star rating can't carry "Late delivery". */
export function cleanTags(rating: number, tags: readonly string[]): FeedbackTag[] {
  const allowed = tagsFor(rating);
  return allowed.filter((tag) => tags.includes(tag));
}

/** One or two stars is a customer the shop should get back to. */
export const LOW_RATING = 2;
/** The owner's "Needs attention": low ratings nobody has read yet. Also the menu badge and the overview queue. */
export const NEEDS_ATTENTION = { state: "rated", rating: { $lte: LOW_RATING }, readAt: null } as const;

/** The popup asks about an order placed in the last two weeks. */
export const PROMPT_WINDOW_DAYS = 14;
/** The order page keeps the stars open this long after delivery. */
export const RATE_WINDOW_DAYS = 30;
/** A "Not now" is forgotten after this long; the order is far outside the popup's window by then. */
export const SKIP_KEEP_DAYS = 60;
export const DAY_MS = 86_400_000;

/** A problem with an item is a complaint, which is where returns are handled. */
const COMPLAINT_TYPES: Partial<Record<FeedbackTag, "missing-item" | "damaged-item" | "wrong-item">> = {
  "item-missing": "missing-item",
  "damaged-item": "damaged-item",
  "wrong-item": "wrong-item",
};
export function complaintTypeFor(rating: number, tags: readonly string[]) {
  if (rating >= 4) return undefined;
  const tag = WRONG_TAGS.find((candidate) => tags.includes(candidate) && COMPLAINT_TYPES[candidate]);
  return tag ? COMPLAINT_TYPES[tag] : undefined;
}

/**
 * Where the popup may open. A list of the pages people browse on, so the basket, checkout,
 * sign-in, school, support and staff pages (and any page added later) stay quiet. An order's own
 * page is left out too: it shows the stars itself.
 */
export function feedbackPromptAllowed(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/catalog" ||
    pathname.startsWith("/products/") ||
    pathname === "/account" ||
    pathname === "/account/orders" ||
    pathname === "/account/wishlist" ||
    pathname === "/account/notifications"
  );
}
