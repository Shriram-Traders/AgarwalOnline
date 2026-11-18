import { requirePage } from "@/lib/auth/session";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { analytics, profitReport } from "@/lib/analytics/service";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { MetricList } from "@/components/metric-list";
import { formatPrice, methodLabel } from "@/lib/display";
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
  // profit uses purchase prices, which only owners see
  const isOwner = hasPermission(user.roles, "settings:write");
  const [data, profit] = await Promise.all([analytics(user.id, params), isOwner ? profitReport(user.id, params) : null]);
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
        // profit is an owner's alone; staff aren't told there is any
        lead={`Sales${isOwner ? ", profit" : ""}, stock, customers and delivery for the dates you choose.`}
        aside={
          <a
            className="secondary-button"
            href={`/api/staff/export/orders?${new URLSearchParams(Object.entries({ from: params.from, to: params.to }).filter(([, v]) => v) as [string, string][])}`}
            download
          >
            Export orders (Excel)
          </a>
        }
      />
      <FilterBar
        label="Choose dates"
        submitLabel="Apply dates"
        clearHref={params.from || params.to ? "/admin/analytics" : undefined}
      >
        <label>
          From
          <input type="date" name="from" defaultValue={params.from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={params.to} />
        </label>
      </FilterBar>
      <div className="analytics-cards">
        {cards.map(([label, value]) => (
          <article className="panel" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      {profit && (
        <div className="panel" id="profit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Owners only</span>
              <h2>Profit</h2>
            </div>
            <span className="order-count">
              {profit.totals.unpriced
                ? `${profit.totals.unpriced} sold ${profit.totals.unpriced === 1 ? "pack has" : "packs have"} no purchase price yet`
                : "Every sold pack has a purchase price"}
            </span>
          </div>
          <div className="analytics-cards">
            {[
              ["Item sales", money(profit.totals.revenuePaise)],
              ["Offer discounts", money(profit.totals.discountPaise)],
              ["Cost of goods", money(profit.totals.costPaise)],
              // with no purchase prices at all there is no profit to show yet, not a ₹0 one
              profit.totals.costPaise || !profit.totals.unpriced
                ? [`Gross profit · ${Math.round(profit.totals.margin * 100)}% margin`, money(profit.totals.profitPaise)]
                : ["Gross profit · needs purchase prices", "—"],
            ].map(([label, value]) => (
              <article className="panel" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <DataTable
            bare
            caption="Profit by pack for the dates chosen"
            exportName="Profit"
            rows={profit.rows}
            rowKey={(row) => row.id}
            columns={[
              { header: "Product", cell: (row) => row.name },
              { header: "Pack", cell: (row) => row.label },
              { header: "Sold", numeric: true, cell: (row) => row.quantity },
              { header: "Takings", numeric: true, cell: (row) => money(row.revenuePaise) },
              { header: "Cost", numeric: true, cell: (row) => (row.costPaise != null ? money(row.costPaise) : "No purchase price") },
              { header: "Profit", numeric: true, cell: (row) => (row.profitPaise != null ? money(row.profitPaise) : "—") },
              {
                header: "Margin",
                numeric: true,
                cell: (row) => (row.profitPaise != null && row.revenuePaise ? `${Math.round((row.profitPaise / row.revenuePaise) * 100)}%` : "—"),
              },
            ]}
            empty={
              <EmptyState
                icon={PackageCheck}
                title="Nothing sold in these dates"
                body="Profit shows here once orders come in. Add purchase prices on each product’s page."
                heading="h3"
              />
            }
          />
          <p className="muted">
            Gross profit = item sales − offer discounts − cost of goods, for packs with a purchase price. Delivery charges are left
            out. It uses each pack’s current purchase price.
          </p>
        </div>
      )}
      <div className="analytics-grid">
        <MetricList title="Order status" rows={data.orderStatuses} />
        <MetricList title="Payment methods" rows={data.paymentMethods.map(([method, count]) => [methodLabel(String(method)), count])} />
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
        {data.providers.length > 0 && (
          <MetricList
            title="Sales by provider"
            rows={data.providers.map((shop) => [shop.name, shop.revenuePaise, formatPrice(shop.revenuePaise)])}
          />
        )}
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Action needed</span>
            <h2>Low stock</h2>
          </div>
          <span className="order-count">Below each pack’s alert level</span>
        </div>
        {/* the lowest ten here; the Stock page has the whole list and can change it */}
        <DataTable
          bare
          caption="Packs below their stock alert level"
          rows={[...data.lowStock].sort((a, b) => a.available - b.available).slice(0, 10)}
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
              body="Packs show up here when fewer than their alert level can be sold."
              heading="h3"
            />
          }
        />
        {data.lowStock.length > 10 && (
          <p className="panel-more">
            <Link href="/admin/inventory?stock=low">See all {data.lowStock.length} in Stock</Link>
          </p>
        )}
      </div>
    </section>
  );
}
