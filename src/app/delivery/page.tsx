import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { CODCollection } from "@/lib/operations/models";
import { istDate } from "@/lib/commerce/delivery";
import { PageHeading } from "@/components/page-heading";
import { StatTiles } from "@/components/stat-tiles";
import { StatusPill } from "@/components/status-pill";
import { formatPrice } from "@/lib/display";
export const metadata = { title: "My deliveries", robots: { index: false } };
export default async function Delivery() {
  const user = await requirePage("delivery:assigned");
  const orders = await Order.find({
    assignedTo: user.id,
    orderStatus: "confirmed",
    deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] },
  })
    .sort({ deliveryDate: 1 })
    .select(
      "number deliveryDate deliveryWindow deliveryStatus totalPaise paymentMethod",
    );
  const history = await Order.find({
    assignedTo: user.id,
    deliveryStatus: "delivered",
  })
    .select("number deliveryDate totalPaise")
    .sort({ updatedAt: -1 })
    .limit(30);
  const cash = await CODCollection.find({
    collectorId: user.id,
    reconciledAt: null,
  }).select("collectedPaise");
  const today = istDate(new Date());
  const [deliveredToday, attemptsToday] = await Promise.all([
    Order.countDocuments({
      assignedTo: user.id,
      deliveryStatus: "delivered",
      deliveryDate: today,
    }),
    Order.countDocuments({
      assignedTo: user.id,
      deliveryStatus: "attempted",
      deliveryDate: today,
    }),
  ]);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Your delivery day"
        title={`Hello, ${user.name}`}
        lead="Your stops in order, the cash you are carrying and what you delivered today."
        aside={
          <span className="live-chip">
            <i /> Updates when you come back
          </span>
        }
      />
      <StatTiles
        items={[
          { label: "Stops to make", value: orders.length },
          { label: "Delivered today", value: deliveredToday },
          { label: "Need another try", value: attemptsToday },
          { label: "Cash to hand over", value: formatPrice(cash.reduce((n, c) => n + c.collectedPaise, 0)) },
        ]}
      />
      <h2 className="queue-heading">Your stops</h2>
      {orders.length ? (
        <div className="stop-list">
          {orders.map((o) => (
            <Link className="panel stop-row" key={String(o._id)} href={`/delivery/orders/${o._id}`}>
              <span>
                <strong>{o.address.name}</strong>
                <small>
                  {o.address.areaName ? `${o.address.areaName} · ` : ""}
                  {o.deliveryWindow} · {o.number}
                </small>
              </span>
              <StatusPill value={o.deliveryStatus} />
              <strong className="stop-collect">
                {o.paymentMethod === "cod" ? `Collect ${formatPrice(o.totalPaise)}` : "Already paid"} →
              </strong>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <h3>You’re all caught up.</h3>
          <p>New deliveries will appear here when assigned to you.</p>
        </div>
      )}
      <h2>Recently delivered</h2>
      {history.length ? (
        <ul className="settings-list">
          {history.map((o) => (
            <li key={String(o._id)}>
              <Link href={`/delivery/orders/${o._id}`}>{o.number}</Link>
              <small>{o.deliveryDate}</small>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={PackageCheck} title="No completed deliveries yet" body="Finished drops are listed here at the end of the round." heading="h3" />
      )}
    </section>
  );
}
