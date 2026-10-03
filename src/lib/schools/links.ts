/** School join links carry a random 24-character token, like shared lists do. */
export const SCHOOL_TOKEN = /^[A-Za-z0-9_-]{24}$/;
export const schoolJoinHref = (token: string) => `/school/join/${token}`;

/**
 * A school join page to come back to after signing in, or null. Only this exact shape is
 * accepted, so the value can never send someone off-site.
 */
export function schoolJoinPath(value: unknown) {
  return typeof value === "string" && /^\/school\/join\/[A-Za-z0-9_-]{24}$/.test(value) ? value : null;
}
