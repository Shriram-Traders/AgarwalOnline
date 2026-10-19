import { z } from "zod";
import { currentUser } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/auth/rate-limit";
import { connectDB } from "@/lib/db/connect";
import { Order } from "@/lib/commerce/models";
import { lowStockRows, lowStockWorkbook } from "@/lib/inventory/low-stock";
import { xlsx, xlsxName } from "@/lib/xlsx";
import { shopSettings } from "@/lib/settings/shop";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const rupees = (paise?: number | null) => (paise == null ? null : paise / 100);
const ist = (date: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(date);

/** Every order in the dates chosen (by default the days set in Customize → Form defaults): one tab of orders, one of the lines in them. */
async function ordersFile(params: URLSearchParams) {
  const dates = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).catch({}).parse(Object.fromEntries(params));
  const end = dates.to ? new Date(`${dates.to}T23:59:59.999+05:30`) : new Date();
  const start = dates.from ? new Date(`${dates.from}T00:00:00+05:30`) : new Date(end.getTime() - ((await shopSettings("defaults")).analyticsDays - 1) * 86400 * 1000);
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
    .sort({ createdAt: 1 })
    .select("number createdAt address orderStatus paymentMethod paymentStatus deliveryStatus deliveryDate subtotalPaise promotionDiscountPaise deliveryPaise totalPaise items")
    .lean()
    .limit(20000);
  return xlsx([
    {
      name: "Orders",
      rows: [
        ["Order", "Placed", "Customer", "Phone", "Area", "Order status", "Payment", "Paid?", "Delivery", "Delivery date", "Items (₹)", "Offer discount (₹)", "Delivery charge (₹)", "Total (₹)"],
        ...orders.map((order) => [
          order.number,
          ist(order.createdAt),
          order.address?.name,
          order.address?.phone,
          order.address?.areaName,
          order.orderStatus,
          order.paymentMethod,
          order.paymentStatus,
          order.deliveryStatus,
          order.deliveryDate,
          rupees(order.subtotalPaise),
          rupees(order.promotionDiscountPaise ?? 0),
          rupees(order.deliveryPaise ?? 0),
          rupees(order.totalPaise),
        ]),
      ],
    },
    {
      name: "Order lines",
      rows: [
        ["Order", "Placed", "Product", "Pack", "Quantity", "Price (₹)", "Line total (₹)", "Order status"],
        ...orders.flatMap((order) =>
          order.items.map((item: { name: string; label: string; quantity: number; pricePaise: number; linePaise: number }) => [
            order.number,
            ist(order.createdAt),
            item.name,
            item.label,
            item.quantity,
            rupees(item.pricePaise),
            rupees(item.linePaise),
            order.orderStatus,
          ]),
        ),
      ],
    },
  ]);
}

const REPORTS: Record<string, { permission: Permission; title: string; build: (params: URLSearchParams, owner: boolean) => Promise<Uint8Array> }> = {
  // purchase prices only in an owner's copy
  "low-stock": { permission: "inventory:adjust", title: "Low stock", build: async (_, owner) => lowStockWorkbook(await lowStockRows({ withCost: owner }), owner) },
  orders: { permission: "analytics:read", title: "Orders", build: ordersFile },
};

/** Excel downloads for staff: the low-stock report and the orders in a date range. */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const spec = Object.hasOwn(REPORTS, report) ? REPORTS[report] : undefined;
  if (!spec) return new Response("Not found", { status: 404, headers: noStore });
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401, headers: noStore });
  if (!hasPermission(user.roles, spec.permission)) return new Response("Not allowed.", { status: 403, headers: noStore });
  try {
    await rateLimit(`staff-export:${user.id}`, 20, 60_000);
  } catch {
    return new Response("Too many downloads. Wait a minute.", { status: 429, headers: noStore });
  }
  await connectDB();
  const file = await spec.build(new URL(request.url).searchParams, hasPermission(user.roles, "settings:write"));
  return new Response(new Uint8Array(file), {
    headers: {
      ...noStore,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${xlsxName(spec.title)}"`,
    },
  });
}
