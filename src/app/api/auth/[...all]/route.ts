import { getAuth } from "@/lib/auth/better-auth";

export const runtime = "nodejs";

/**
 * The app's own screens sign people in through server actions that call `auth.api` directly, so
 * the only Better Auth addresses the outside world needs are the ones other sites send people back
 * to: Google's sign-in callback and the link in the confirmation email (plus Better Auth's error page).
 * Everything else stays closed. Left open, the phone plugin's password-reset and code addresses could
 * be called directly, skipping the app's own per-number limits.
 */
const PUBLIC_PATHS = [/^\/callback\/[a-z]+$/, /^\/verify-email$/, /^\/error$/];

function allowed(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  return PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

const closed = () => new Response("Not found", { status: 404 });

export function GET(request: Request) {
  return allowed(request) ? getAuth().handler(request) : closed();
}

export function POST(request: Request) {
  return allowed(request) ? getAuth().handler(request) : closed();
}
