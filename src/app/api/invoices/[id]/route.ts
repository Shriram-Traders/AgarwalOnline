import { currentUser } from "@/lib/auth/session";
import { lineNotes, shortfallRefund, type PackedLine } from "@/lib/operations/packing";
import { Refund } from "@/lib/payments/models";
import { invoiceOrder } from "@/lib/family/service";
import { methodLabel } from "@/lib/display";

function escape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required", { status: 401 });
  // staff who manage orders may open any invoice; everyone else their own, or their family's
  const order = await invoiceOrder(user, (await params).id);
  if (!order) return new Response("Invoice not found", { status: 404 });
  const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
  // a cash bill follows what was packed; an online payment stays as paid, with the shortfall noted
  const charged = order.paymentMethod === "cod";
  const rows = order.items
    .map((item: PackedLine) => {
      const notes = lineNotes(item, charged)
        .map((note) => `<small class="note">${escape(note)}</small>`)
        .join("");
      return `<tr><td>${escape(item.name)}<small>${escape(item.label)}</small>${notes}</td><td>${item.quantity}</td><td>${rupees(item.pricePaise)}</td><td>${rupees(item.linePaise)}</td></tr>`;
    })
    .join("");
  const offer = order.promotionDiscountPaise
    ? `<p><span>Offer</span><strong>−${rupees(order.promotionDiscountPaise)}</strong></p>`
    : "";
  const asOrdered =
    order.originalTotalPaise != null
      ? `<p class="muted">Items that weren’t available were taken off this bill. Total as ordered: ${rupees(order.originalTotalPaise)}.</p>`
      : "";
  // read only: where the refund for items that weren't packed stands (it is made on the Refunds page)
  const refund = shortfallRefund(
    order.shortfallPaise,
    order.shortfallPaise ? await Refund.find({ orderId: order._id }).select("amountPaise status") : [],
  );
  const shortfall = refund
    ? `<p class="muted">Paid online. ${rupees(order.shortfallPaise)} of this payment is for items that weren’t available${
        refund === "refunded"
          ? ", and it has been refunded."
          : refund === "under-way"
            ? "; that refund is under way."
            : "; the store arranges that refund separately."
      }</p>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(order.number)} invoice</title><style>body{font:15px Arial;color:#0f172a;max-width:760px;margin:48px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1e3a8a;padding-bottom:22px}h1{font-size:24px;margin:0}.muted,small{display:block;color:#5b6472;margin-top:4px}table{width:100%;border-collapse:collapse;margin:32px 0}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e5e8ee}th:last-child,td:last-child{text-align:right}.totals{margin-left:auto;width:300px}.totals p{display:flex;justify-content:space-between}.grand{font-size:20px;font-weight:700;border-top:2px solid #0f172a;padding-top:12px}small.note{color:#9a3412;font-weight:600}@media print{body{margin:20px auto}}</style></head><body><header><div><h1>AGARWAL GENERAL STORES</h1><span class="muted">Everything You Need, Delivered to Your Doorstep</span></div><div><strong>Order invoice</strong><span class="muted">${escape(order.number)}</span></div></header><p><strong>Deliver to:</strong><br>${escape(order.address.name)}<br>${escape(order.address.line)}, ${escape(order.address.areaName)} ${escape(order.address.pin)}</p><p class="muted">Ordered ${new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · ${escape(methodLabel(order.paymentMethod))} · ${escape(order.paymentStatus)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p><span>Subtotal</span><strong>${rupees(order.subtotalPaise)}</strong></p>${offer}<p><span>Delivery</span><strong>${rupees(order.deliveryPaise)}</strong></p><p class="grand"><span>Total</span><span>${rupees(order.totalPaise)}</span></p></div>${asOrdered}${shortfall}<p class="muted">Computer-generated order invoice. Tax details are not shown because GST configuration has not been supplied.</p></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${order.number}-invoice.html"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
