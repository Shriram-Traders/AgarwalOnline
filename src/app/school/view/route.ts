import { NextRequest, NextResponse } from "next/server";
import { safeSchoolPath } from "@/lib/schools/paths";
import { VIEW_COOKIE } from "@/lib/schools/view";

export const runtime = "nodejs";

/** Cards or the bulk list in the school catalogue: remembered in this browser, then back to the catalogue. */
export function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("v") === "list" ? "list" : "cards";
  // a same-site redirect by path: the server's own host name can differ from the address bar's
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: safeSchoolPath(request.nextUrl.searchParams.get("then") ?? "/school/catalog") },
  });
  response.cookies.set(VIEW_COOKIE, view, { path: "/school", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
