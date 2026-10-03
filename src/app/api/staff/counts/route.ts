import { currentUser } from "@/lib/auth/session";
import { staffRoleOf } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/auth/rate-limit";
import { staffCounts } from "@/lib/admin/work-queues";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

/** The numbers beside the staff menu and on the bell. Asked on page changes and while the tab is open. */
export async function GET() {
  const user = await currentUser();
  if (!user || !staffRoleOf(user.roles))
    return Response.json({ error: "Sign in with a staff account." }, { status: 401, headers: noStore });
  try {
    await rateLimit(`staff-counts:${user.id}`, 60, 60_000);
  } catch {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: noStore });
  }
  return Response.json(await staffCounts(user), { headers: noStore });
}
