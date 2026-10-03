import { listPath } from "./lists/links";
import { schoolJoinPath } from "./schools/links";

/** Pages people commonly sign in from, and are sent back to afterwards. */
const EXACT = new Set(["/checkout", "/cart", "/account/wishlist", "/catalog", "/school"]);

/**
 * Where to go after signing in, when the person started somewhere specific (checkout, a product,
 * a shared list), or null. Only these exact shapes are accepted, so the value can never send
 * someone off-site or to an unexpected page.
 */
export function returnPath(value: unknown) {
  if (typeof value !== "string") return null;
  if (EXACT.has(value)) return value;
  if (/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return value;
  return listPath(value) ?? schoolJoinPath(value);
}
