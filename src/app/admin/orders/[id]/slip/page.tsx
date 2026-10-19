import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ReceiptText } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { User } from "@/lib/db/models";
import { objectId } from "@/lib/commerce/service";
import { formatIst, formatPrice, noBreakTimes } from "@/lib/display";
import { dayLabel } from "@/lib/commerce/slots";
import { lineNotes, type PackedLine } from "@/lib/operations/packing";
import { taxProfile } from "@/lib/tax/profile";
import { PrintButton } from "@/components/print-button";
import { shopSettings } from "@/lib/settings/shop";
export const metadata = { title: "Packing slip", robots: { index: false } };

/** The customer's "If an item is unavailable" choice, as the packer should read it. */
const IF_UNAVAILABLE: Record<string, string> = {
  contact: "Call the customer before leaving anything out or swapping it",
  "best-match": "Pack the closest match, at the same price",
  "no-substitutions": "Don’t swap: leave it out",
};

/**
 * A sheet to print and pack from: who it's for, when it goes, every line with a box to tick, what
 * to do if something is missing, and what the rider collects. The bill is the order's invoice.
 */
export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("order:manage");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const [o, shop, slip] = await Promise.all([Order.findById(id), taxProfile(), shopSettings("slip")]);
  if (!o) notFound();
  const customer = await User.findById(o.customerId).select("substitutionPreference");
  const lines = o.items as (PackedLine & { variantId: string; name: string; label: string; quantity: number })[];
  const cash = o.paymentMethod === "cod";
  const day = o.deliveryDate ? dayLabel(o.deliveryDate) : "";
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <section className={`page-container packing-slip-page paper-${slip.paper}`}>
      {/* the paper the owner picked in Customize → Packing slips */}
      <style>{`@media print{@page{size:${slip.paper === "a5" ? "A5" : slip.paper === "receipt" ? "80mm auto" : "A4"};margin:${slip.paper === "receipt" ? "4mm" : "12mm"}}}`}</style>
      <nav className="breadcrumb slip-actions" aria-label="Breadcrumb">
        <Link href="/admin#orders">Orders</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={`/admin/orders/${id}`}>{o.number}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Packing slip</span>
      </nav>
      <div className="slip-actions split-actions">
        <PrintButton label="Print packing slip" />
        {o.orderStatus !== "cancelled" && (
          <a className="secondary-button" href={`/api/invoices/${id}`} target="_blank" rel="noreferrer">
            <ReceiptText size={18} aria-hidden="true" /> Open the bill
          </a>
        )}
      </div>

      <article className="packing-slip">
        <header className="slip-head">
          <div>
            <p className="slip-shop">
              {shop.legalName} · {slip.title}
            </p>
            {slip.showShopAddress && (
              <p className="slip-shop-line">{[shop.address, shop.phone && `Phone ${shop.phone}`].filter(Boolean).join(" · ")}</p>
            )}
            <h1>{o.number}</h1>
            <p>Placed {formatIst(o.createdAt)}</p>
          </div>
          <div className="slip-when">
            <strong>{day || "Delivery"}</strong>
            <span>{noBreakTimes(o.deliveryWindow)}</span>
          </div>
        </header>

        <section className="slip-to" aria-labelledby="slip-to">
          <h2 id="slip-to">Deliver to</h2>
          <p>
            <strong>{o.address.name}</strong>
            {slip.showPhone && o.address.phone && <> · +91 {o.address.phone}</>}
            <br />
            {o.address.line}
            <br />
            {o.address.areaName} · {o.address.pin}
          </p>
          {slip.showInstructions && o.address.instructions && <p className="slip-note">Note: “{o.address.instructions}”</p>}
        </section>

        <table className="slip-lines">
          <caption>
            {pieces} {pieces === 1 ? "piece" : "pieces"} in {lines.length} {lines.length === 1 ? "line" : "lines"}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="slip-tick">
                <span className="sr-only">Packed</span>
              </th>
              <th scope="col">Qty</th>
              <th scope="col">Item</th>
              {slip.showPrices && (
                <th scope="col" className="slip-money">
                  Amount
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={String(line.variantId)}>
                <td className="slip-tick">
                  <span className="slip-box" aria-hidden="true" />
                </td>
                <td className="slip-qty">{line.quantity}</td>
                <td>
                  <strong>{line.name}</strong> <span className="muted">· {line.label}</span>
                  {lineNotes(line, cash).map((note) => (
                    <small key={note}>{note}</small>
                  ))}
                </td>
                {slip.showPrices && (
                  <td className="slip-money">
                    {formatPrice(line.linePaise)}
                    <small>
                      {line.quantity} × {formatPrice(line.pricePaise)}
                    </small>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {slip.showPrices && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  Total{o.deliveryPaise ? ` with ${formatPrice(o.deliveryPaise)} delivery` : ""}
                </th>
                <td className="slip-money">{formatPrice(o.totalPaise)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {(slip.showPreference || slip.showPayment || o.orderStatus === "cancelled") && (
          <dl className="slip-facts">
            {slip.showPreference && (
              <div>
                <dt>If an item is unavailable</dt>
                <dd>{IF_UNAVAILABLE[customer?.substitutionPreference ?? "contact"] ?? IF_UNAVAILABLE.contact}</dd>
              </div>
            )}
            {/* a cancelled order says so whatever the settings: it must not go out */}
            {(slip.showPayment || o.orderStatus === "cancelled") && (
              <div>
                <dt>Payment</dt>
                <dd>
                  {o.orderStatus === "cancelled"
                    ? "Cancelled: don’t send"
                    : cash
                      ? `Cash on delivery: collect ${formatPrice(o.totalPaise)}`
                      : "Paid online: collect nothing"}
                </dd>
              </div>
            )}
          </dl>
        )}

        {slip.showSignatures && (
          <footer className="slip-sign">
            <span>{slip.signature1} ____________________</span>
            <span>{slip.signature2} ____________________</span>
          </footer>
        )}
        {slip.footerNote && <p className="slip-foot">{slip.footerNote}</p>}
      </article>
    </section>
  );
}
