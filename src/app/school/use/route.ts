import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { memberships } from "@/lib/schools/membership";
import { SCHOOL_COOKIE } from "@/lib/schools/current";
import { safeSchoolPath } from "@/lib/schools/paths";

export const runtime = "nodejs";

/** A same-site redirect by path: the server's idea of its own host can differ from the one in the address bar. */
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

/**
 * Choose which school the school marketplace is for, then go on to `then` (only ever a page in
 * the school area). Used by the school switcher and by old links that carry `?s=`. The cookie
 * is only a preference: every page and action checks membership again.
 */
export async function GET(request: NextRequest) {
  const then = safeSchoolPath(request.nextUrl.searchParams.get("then"));
  const user = await currentUser();
  if (!user) return go(`/login?then=${encodeURIComponent(then)}`);
  const wanted = request.nextUrl.searchParams.get("s") ?? "";
  const mine = (await memberships(user.id)).some((school) => school.id === wanted);
  // someone else's school: nothing is remembered, and the school home explains what they can do
  if (!mine) return go("/school");
  const response = go(then);
  response.cookies.set(SCHOOL_COOKIE, wanted, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
