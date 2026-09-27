import { requirePage } from "@/lib/auth/session";
import { DataTable } from "@/components/data-table";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { analytics } from "@/lib/analytics/service";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Analytics", robots: { index: false } };

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePage("analytics:read");
  const params = await searchParams;
  const data = await analytics(user.id, params);
  const cards = [
    ["Gross sales", money(data.metrics.grossPaise)],
    ["Net revenue", money(data.metrics.netPaise)],
    ["Orders", String(data.metrics.orders)],
    ["Average order", money(data.metrics.averagePaise)],
    ["Refunded", money(data.metrics.refundPaise)],
    ["On-time delivery", `${Math.round(data.metrics.onTimeRate * 100)}%`],
    [
      "Cancellation rate",
      `${Math.round(data.metrics.cancellationRate * 100)}%`,
    ],
    ["Returning customers", String(data.metrics.returningCustomers)],
  ];
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Analytics"
        lead="Sales, stock, customers and delivery for the dates you choose. Demo orders count when the demo data is loaded."
      />
      <form className="audit-filters">
        <label>
          From
          <input type="date" name="from" defaultValue={params.from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={params.to} />
        </label>
        <button className="primary-button">Apply dates</button>
      </form>
      <div className="analytics-cards">
        {cards.map(([label, value]) => (
          <article className="panel" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="analytics-grid">
        <MetricList title="Order status" rows={data.orderStatuses} />
        <MetricList title="Payment methods" rows={data.paymentMethods} />
        <MetricList title="Delivery status" rows={data.deliveryStatuses} />
        <MetricList
          title="Top products"
          rows={data.topProducts.map((item) => [item.name, item.quantity])}
        />
        <MetricList
          title="Service areas"
          rows={data.areas.map((item) => [item.name, item.orders])}
        />
        <MetricList
          title="Partner deliveries"
          rows={data.partners.map((item) => [item.name, item.deliveries])}
        />
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ACTION NEEDED</span>
            <h2>Low stock</h2>
          </div>
          <span className="order-count">10 or fewer</span>
        </div>
        <DataTable
          bare
          caption="Products at or below the low-stock threshold"
          rows={data.lowStock}
          rowKey={(item) => item.id}
          columns={[
            { header: "Product", cell: (item) => item.name },
            { header: "Pack", cell: (item) => item.label },
            { header: "Available", numeric: true, cell: (item) => item.available },
          ]}
          empty={
            <EmptyState
              icon={PackageCheck}
              title="Everything is in stock"
              body="Packs fall below the threshold here when they run low."
              heading="h3"
            />
          }
        />
      </div>
    </section>
  );
}

function MetricList({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, number]>;
}) {
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return (
    <article className="panel metric-list">
      <h2>{title}</h2>
      {rows.length ? (
        rows.map(([label, value]) => (
          <div key={label}>
            <span>{label.replaceAll("-", " ")}</span>
            <strong>{value}</strong>
            <i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
          </div>
        ))
      ) : (
        <p className="muted">No data in this period.</p>
      )}
    </article>
  );
}
