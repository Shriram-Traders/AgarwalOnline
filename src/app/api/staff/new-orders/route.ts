import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/auth/rate-limit";
import { connectDB } from "@/lib/db/connect";
import { Order } from "@/lib/commerce/models";
import { FILTERS } from "@/lib/admin/order-filters";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
/** Orders are looked for a little before the last ask, so one saved just as it ran isn't missed. */
const OVERLAP_MS = 60_000;

export type NewOrdersResponse = {
  /** The server's time: send it back as `since` next time. */
  at: string;
  orders: { id: string; number: string; totalPaise: number; area?: string }[];
};

/**
 * Orders waiting to be confirmed that came in since `since`, for the staff header's new-order
 * sound. Asked every 20 s while it's switched on; staff who manage orders only.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, "order:manage"))
    return Response.json({ error: "Not allowed." }, { status: 403, headers: noStore });
  try {
    await rateLimit(`staff-new-orders:${user.id}`, 30, 60_000);
  } catch {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: noStore });
  }
  const now = new Date();
  const asked = Date.parse(new URL(request.url).searchParams.get("since") ?? "");
  // never further back than 10 minutes: a tab left asleep for a day shouldn't ring for every order
  const since = new Date(Math.max(Number.isFinite(asked) ? asked : now.getTime(), now.getTime() - 10 * 60_000) - OVERLAP_MS);
  await connectDB();
  const orders = await Order.find({ ...FILTERS["to-confirm"].match, createdAt: { $gt: since } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("number totalPaise address.areaName")
    .lean<{ _id: unknown; number: string; totalPaise?: number; address?: { areaName?: string } }[]>();
  const body: NewOrdersResponse = {
    at: now.toISOString(),
    orders: orders.map((order) => ({
      id: String(order._id),
      number: order.number,
      totalPaise: order.totalPaise ?? 0,
      area: order.address?.areaName,
    })),
  };
  return Response.json(body, { headers: noStore });
}
