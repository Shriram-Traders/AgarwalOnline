import Link from "next/link";
import { dayLabel } from "@/lib/commerce/slots";
import { MapPin, PackageCheck, Phone } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { objectId } from "@/lib/commerce/service";
import { CashHandover, CODCollection, DeliveryAttempt } from "@/lib/operations/models";
import { operationAction } from "@/lib/operations/actions";
import { shopSettings } from "@/lib/settings/shop";
import { ActionForm } from "@/components/action-form";
import { When } from "@/components/when";
import { roundByDay } from "@/lib/operations/stops";
import { istDate } from "@/lib/commerce/delivery";
import { PageHeading } from "@/components/page-heading";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { RefreshStaffCounts } from "@/components/refresh-staff-counts";
import { StatTiles } from "@/components/stat-tiles";
import { StatusPill } from "@/components/status-pill";
import { formatPrice, noBreakTimes } from "@/lib/display";
export const metadata = { title: "My deliveries", robots: { index: false } };

/** What the rider just did on a stop that has now left the list, said at the top of it. */
async function justDone(riderId: string, { done, closed }: { done?: string; closed?: string }) {
  const id = done ?? closed;
  if (!id || !objectId.safeParse(id).success) return null;
  const order = await Order.findOne({ _id: id, assignedTo: riderId }).select("number totalPaise paymentMethod deliveryStatus");
  if (!order) return null;
  if (done && order.deliveryStatus === "delivered") {
    if (order.paymentMethod !== "cod") return `Delivered ${order.number}.`;
    return (await CODCollection.exists({ orderId: order._id, method: "upi" }))
      ? `Delivered ${order.number}. ${formatPrice(order.totalPaise)} was paid by UPI: nothing to hand over.`
      : `Delivered ${order.number}. ${formatPrice(order.totalPaise)} cash is with you: hand it over at the shop.`;
  }
  if (closed && order.deliveryStatus === "failed")
    return `${order.number} closed as not delivered. The customer and the shop have been told, and the shop decides what happens to the parcel.`;
  return null;
}

export default async function Delivery({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; closed?: string }>;
}) {
  const user = await requirePage("delivery:assigned");
  const today = istDate(new Date());
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const [orders, history, cash, deliveredToday, missedToday, collectedToday, handovers, { riderPay }, message, paidByUpi] = await Promise.all([
    Order.find({
      assignedTo: user.id,
      orderStatus: "confirmed",
      deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] },
    }).select("number deliveryDate deliveryWindow deliveryStatus totalPaise paymentMethod address"),
    Order.find({ assignedTo: user.id, deliveryStatus: "delivered" })
      .select("number deliveryDate totalPaise paymentMethod")
      .sort({ updatedAt: -1 })
      .limit(30),
    // cash only: UPI at the door went straight to the shop
    CODCollection.find({ collectorId: user.id, reconciledAt: null, method: { $ne: "upi" } })
      .select("orderId collectedPaise handoverId")
      .populate("orderId", "number"),
    // the bill is issued the moment a parcel is handed over, so it dates the delivery itself
    Order.countDocuments({ assignedTo: user.id, deliveryStatus: "delivered", "bill.issuedAt": { $gte: dayStart } }),
    DeliveryAttempt.countDocuments({ partnerId: user.id, at: { $gte: dayStart } }),
    CODCollection.find({ collectorId: user.id, collectedAt: { $gte: dayStart } }).select("collectedPaise method"),
    CashHandover.find({ riderId: user.id }).sort({ createdAt: -1 }).limit(10).populate("confirmedBy", "name"),
    shopSettings("defaults"),
    justDone(user.id, await searchParams),
    // which of the recent deliveries were paid by UPI, for their line under Recently delivered
    CODCollection.find({ collectorId: user.id, method: "upi" }).sort({ collectedAt: -1 }).limit(30).select("orderId"),
  ]);
  const upiOrders = new Set(paidByUpi.map((c) => String(c.orderId)));
  const cashToday = collectedToday.filter((c) => c.method !== "upi");
  const upiToday = collectedToday.filter((c) => c.method === "upi");
  const sum = (rows: { collectedPaise: number }[]) => rows.reduce((n, c) => n + c.collectedPaise, 0);
  // cash not settled yet: still in the rider's pocket, or handed over and waiting for the shop to count it
  const unsettled = new Map(cash.map((c) => [String((c.orderId as { _id: unknown })?._id ?? c.orderId), c]));
  const inPocket = cash.filter((c) => !c.handoverId);
  const waiting = handovers.filter((h) => !h.confirmedAt);
  const days = roundByDay(orders);
  return (
    <section className="page-container">
      <RefreshOnFocus />
      <PageHeading
        eyebrow="Your delivery day"
        title={`Hello, ${user.name}`}
        lead="Your stops in the order of the round, the cash you are carrying and what you delivered today."
        aside={
          <span className="live-chip">
            <i /> Updates when you come back
          </span>
        }
      />
      {message && (
        <p className="success-message" role="status">
          {message}
          {/* the stop just left the list: the Deliveries badge says so at once */}
          <RefreshStaffCounts />
        </p>
      )}
      <StatTiles
        items={[
          { label: "Stops to make", value: orders.length },
          { label: "Delivered today", value: deliveredToday },
          { label: "Missed today", value: missedToday },
          { label: "Cash collected today", value: formatPrice(sum(cashToday)) },
          ...(upiToday.length ? [{ label: "Paid by UPI today", value: formatPrice(sum(upiToday)) }] : []),
          // only when the shop pays per delivery (Settings → Defaults)
          ...(riderPay > 0 ? [{ label: "Earned today", value: formatPrice(deliveredToday * riderPay) }] : []),
        ]}
      />
      <h2 className="queue-heading">Your stops</h2>
      {days.length ? (
        days.map((day) => (
          <section key={day.date} aria-label={dayLabel(day.date)}>
            <h3>
              {dayLabel(day.date)}
              {day.date < today && " · late"}
            </h3>
            <div className="stop-list">
              {day.stops.map((o) => (
                // the call and map buttons sit beside the stop's link, not inside it
                <div className="panel stop-row" key={String(o._id)}>
                  <Link className="stop-main" href={`/delivery/orders/${o._id}`}>
                    <span>
                      <strong>{o.address.name}</strong>
                      {o.address.line && <small className="stop-address">{o.address.line}</small>}
                      <small>
                        {o.address.areaName ? `${o.address.areaName} · ` : ""}
                        {noBreakTimes(o.deliveryWindow)} · <span className="nowrap">{o.number}</span>
                      </small>
                    </span>
                    <StatusPill value={o.deliveryStatus} />
                    <strong className="stop-collect">
                      {o.paymentMethod === "cod" ? `Collect ${formatPrice(o.totalPaise)}` : "Already paid"} →
                    </strong>
                  </Link>
                  <div className="stop-actions">
                    {o.address.phone && (
                      <a className="secondary-button compact-button" href={`tel:+91${o.address.phone}`} aria-label={`Call ${o.address.name}`}>
                        <Phone size={16} aria-hidden="true" /> Call
                      </a>
                    )}
                    <a
                      className="secondary-button compact-button"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [o.address.line, o.address.areaName, o.address.pin].filter(Boolean).join(" "),
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Map to ${o.address.name}’s address (opens Google Maps)`}
                    >
                      <MapPin size={16} aria-hidden="true" /> Map
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="panel">
          <h3>You’re all caught up.</h3>
          <p>New deliveries will appear here when assigned to you.</p>
        </div>
      )}
      <h2 id="cash">Your cash</h2>
      <div className="panel">
        {inPocket.length ? (
          <>
            <p>
              <strong>{formatPrice(sum(inPocket))}</strong> with you, from{" "}
              {inPocket.map((c) => (c.orderId as { number?: string })?.number).join(", ")}.
            </p>
            <ActionForm
              action={operationAction}
              submit={`I’m handing over ${formatPrice(sum(inPocket))}`}
              confirmMessage={`Hand over ${formatPrice(sum(inPocket))} at the counter? The shop counts it and confirms.`}
            >
              <input type="hidden" name="operation" value="start-handover" />
            </ActionForm>
          </>
        ) : (
          <p>No cash with you right now.</p>
        )}
        {waiting.map((h) => (
          <p className="notice" key={String(h._id)}>
            {formatPrice(h.amountPaise)} handed over <When at={h.createdAt} />: waiting for the shop to confirm.
          </p>
        ))}
        {handovers.some((h) => h.confirmedAt) && (
          <>
            <h3>Handovers</h3>
            <ul className="settings-list">
              {handovers
                .filter((h) => h.confirmedAt)
                .map((h) => (
                  <li key={String(h._id)}>
                    <strong>{formatPrice(h.amountPaise)}</strong>
                    <small>
                      Confirmed by {(h.confirmedBy as { name?: string })?.name ?? "the shop"} <When at={h.confirmedAt} />
                    </small>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
      <h2>Recently delivered</h2>
      {history.length ? (
        <ul className="settings-list">
          {history.map((o) => {
            const cashNow = unsettled.get(String(o._id));
            return (
              <li key={String(o._id)}>
                {/* delivered: its page is for the stops still to make, so the number only */}
                <strong>{o.number}</strong>
                <small>
                  {o.deliveryDate ? dayLabel(o.deliveryDate) : ""}
                  {o.paymentMethod === "cod" && upiOrders.has(String(o._id)) && ` · ${formatPrice(o.totalPaise)} paid by UPI`}
                  {o.paymentMethod === "cod" &&
                    !upiOrders.has(String(o._id)) &&
                    ` · ${formatPrice(cashNow?.collectedPaise ?? o.totalPaise)} cash ${
                      !cashNow ? "settled" : cashNow.handoverId ? "handed over, waiting for the shop" : "with you"
                    }`}
                </small>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={PackageCheck} title="No completed deliveries yet" body="Finished drops are listed here at the end of the round." heading="h3" />
      )}
    </section>
  );
}
