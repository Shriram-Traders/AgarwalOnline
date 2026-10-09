/** List links carry a random 24-character token. */
export const LIST_TOKEN = /^[A-Za-z0-9_-]{24}$/;

/**
 * A shared board, basket or family invite page to come back to after signing in, or null.
 * Only these exact shapes are accepted, so the value can never send someone off-site.
 */
export function listPath(value: unknown) {
  return typeof value === "string" && /^\/(lists|family)\/[A-Za-z0-9_-]{24}$/.test(value)
    ? value
    : null;
}
