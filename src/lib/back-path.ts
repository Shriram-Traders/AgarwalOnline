/** Starting points: nothing inside the app sits "behind" these, so they get no Back button. */
export const HOME_PATHS = new Set(["/", "/admin", "/super-admin", "/delivery"]);

/** Pages whose natural parent isn't simply the path one level up. */
const PARENTS: [RegExp, string][] = [
  [/^\/products\/[^/]+$/, "/catalog"],
  [/^\/checkout$/, "/cart"],
  [/^\/account\/lists\/[^/]+$/, "/account/wishlist"],
  // order pages have no /orders list of their own on the staff side
  [/^\/admin\/orders\/[^/]+$/, "/admin"],
  [/^\/delivery\/orders\/[^/]+$/, "/delivery"],
  [/^\/lists\/[^/]+$/, "/"],
  [/^\/staff\/login$/, "/"],
];

/**
 * Where Back goes when this tab has no earlier page of the shop to return to, such as a link
 * opened from WhatsApp or a refreshed page: the page one level up, never off the site.
 */
export function parentPath(pathname: string) {
  for (const [pattern, parent] of PARENTS) if (pattern.test(pathname)) return parent;
  return pathname.replace(/\/[^/]*$/, "") || "/";
}
