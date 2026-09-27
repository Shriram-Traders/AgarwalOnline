import { currentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Where a verification link lands after Better Auth has checked it. Better Auth adds `?error=` when the
 * link was expired or invalid. Signed-in people go to their account; everyone else to sign-in, with the result.
 */
export async function GET(request: Request) {
  const error = new URL(request.url).searchParams.get("error");
  const result = error ? `email=${encodeURIComponent(error)}` : "email=verified";
  const user = await currentUser();
  // a relative Location keeps the browser on the host it came from, so its session cookie still applies
  return new Response(null, {
    status: 303,
    headers: { Location: `${user ? "/account" : "/login"}?${result}` },
  });
}
