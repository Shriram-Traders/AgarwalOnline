import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { staffRoleOf } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/auth/rate-limit";
import { findRecords } from "@/lib/staff/records";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

/** Products, orders and customers for the workspace search, as the person types. Staff only. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || !staffRoleOf(user.roles))
    return Response.json({ error: "Sign in with a staff account." }, { status: 401, headers: noStore });
  try {
    // a keystroke each: generous, but a runaway loop still stops
    await rateLimit(`staff-search:${user.id}`, 240, 60_000);
  } catch {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: noStore });
  }
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json({ hits: await findRecords(query, user.roles) }, { headers: noStore });
}
