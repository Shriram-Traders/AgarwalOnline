import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { shortfallRefund } from "@/lib/operations/packing";
import { Refund } from "@/lib/payments/models";
import { invoiceOrder } from "@/lib/family/service";
import { taxProfile } from "@/lib/tax/profile";
import { GST_STATES } from "@/lib/tax/gst";
import { billNumber, previousBillNumber } from "@/lib/commerce/bill";
import { shopSettings } from "@/lib/settings/shop";
import { renderInvoice, type InvoiceOrder } from "@/lib/documents/invoice";
import { lineFacts } from "@/lib/documents/line-facts";
import { getEnv } from "@/lib/env";

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * An order's bill: a cash memo, or a tax invoice once the shop has a GSTIN (see renderInvoice). With
 * ?kind=estimate, staff get a kaccha bill instead: the same lines before delivery, marked as not a bill.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return text("Authentication required", 401);
  // staff who manage orders may open any bill; everyone else their own, or their family's
  const order = await invoiceOrder(user, (await params).id);
  if (!order) return text("Bill not found", 404);
  const staff = hasPermission(user.roles, "order:manage");
  const estimate = new URL(request.url).searchParams.get("kind") === "estimate";
  if (estimate) {
    if (!staff) return text("Only the store can make an estimate.", 403);
    if (order.orderStatus === "cancelled") return text("A cancelled order has no estimate.", 409);
    if (order.deliveryStatus === "delivered" || order.bill?.issuedAt)
      return text("This order is delivered: its bill is the one to give.", 409);
  }
  const [shop, bill, facts] = await Promise.all([taxProfile(), shopSettings("bill"), lineFacts(order.items)]);
  // a bill already issued (at delivery) keeps the shop's details as they were then
  const kept = order.bill?.issuedAt && order.bill?.seller?.legalName ? order.bill.seller : null;
  const seller = {
    legalName: kept?.legalName ?? shop.legalName,
    address: kept ? kept.address : shop.address,
    phone: kept ? kept.phone : shop.phone,
    gstin: kept ? kept.gstin : shop.gstin,
    email: shop.email,
  };
  const state = GST_STATES.find((entry) => entry.code === shop.stateCode);
  // read only: where the refund for items that weren't packed stands (it is made on the Refunds page)
  const refund = shortfallRefund(
    order.shortfallPaise,
    order.shortfallPaise ? await Refund.find({ orderId: order._id }).select("amountPaise status") : [],
  );
  const number = estimate ? `EST-${order.number}` : billNumber(order);
  const html = renderInvoice({
    order: order.toObject() as InvoiceOrder,
    seller,
    stateName: state ? `${state.name} (${state.code})` : shop.stateCode,
    number,
    replaces: estimate ? null : previousBillNumber(order),
    date: order.bill?.issuedAt ?? order.createdAt,
    bill,
    refund,
    facts,
    origin: getEnv().APP_ORIGIN,
    estimate,
    staffView: staff,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition":
        bill.openAs === "download" ? `attachment; filename="${number}-${estimate ? "estimate" : "bill"}.html"` : "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
