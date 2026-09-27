import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { formatPrice } from "@/lib/display";
import { HandCoins } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { CODCollection } from "@/lib/operations/models";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Cash on delivery", robots: { index: false } };

export default async function CODPage() {
  await requirePage("cod:reconcile");
  const collections = await CODCollection.find({})
    .sort({ collectedAt: -1 })
    .limit(250)
    .populate("orderId", "number codStatus")
    .populate("collectorId", "name");
  const open = collections.filter((item) => !item.reconciledAt);
  const discrepancies = collections.filter(
    (item) => item.discrepancyPaise && !item.discrepancyResolvedAt,
  );
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Cash on delivery"
        lead="Cash the delivery partners collected, what was handed over at the counter, and any difference still to settle. Open an order to record a handover."
      />
      <div className="analytics-cards">
        <article className="panel">
          <small>Waiting for handover</small>
          <strong>
            {formatPrice(open.reduce((sum, item) => sum + item.collectedPaise, 0))}
          </strong>
        </article>
        <article className="panel">
          <small>Open discrepancies</small>
          <strong>{discrepancies.length}</strong>
        </article>
        <article className="panel">
          <small>Total collections</small>
          <strong>{collections.length}</strong>
        </article>
      </div>
      <DataTable
        caption="Cash on delivery collections with partner, amounts and reconciliation status"
        rows={collections}
        rowKey={(item) => String(item._id)}
        columns={[
          {
            header: "Order",
            cell: (item) => {
              const order = item.orderId as unknown as { _id: unknown; number?: string };
              return (
                <Link href={`/admin/orders/${order?._id}`}>
                  {order?.number ?? "Order"}
                </Link>
              );
            },
          },
          {
            header: "Partner",
            cell: (item) => (item.collectorId as unknown as { name?: string })?.name,
          },
          {
            header: "Collected",
            numeric: true,
            cell: (item) => formatPrice(item.collectedPaise),
          },
          {
            header: "Received",
            numeric: true,
            cell: (item) =>
              item.receivedPaise == null ? "—" : formatPrice(item.receivedPaise),
          },
          {
            header: "Status",
            cell: (item) =>
              !item.reconciledAt ? (
                <StatusPill tone="warn">Awaiting handover</StatusPill>
              ) : item.discrepancyPaise && !item.discrepancyResolvedAt ? (
                <StatusPill tone="bad">
                  Discrepancy {formatPrice(item.discrepancyPaise)}
                </StatusPill>
              ) : (
                <StatusPill tone="ok">Reconciled</StatusPill>
              ),
          },
        ]}
        empty={
          <EmptyState
            icon={HandCoins}
            title="No cash to reconcile"
            body="Cash collected on delivery appears here until it is handed over."
          />
        }
      />
    </section>
  );
}
