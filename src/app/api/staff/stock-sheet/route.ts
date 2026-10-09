import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { stockSheet } from "@/lib/inventory/import";

/** The stock as a spreadsheet to fill in and upload on the Stock page. Staff who adjust stock only. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Please sign in", { status: 401 });
  if (!hasPermission(user.roles, "inventory:adjust")) return new Response("Not allowed", { status: 403 });
  const csv = await stockSheet(user.id);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
