import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatPrice } from "@/lib/display";
import { UsersRound } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { User } from "@/lib/db/models";
import { Address, Order } from "@/lib/commerce/models";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
export const metadata = { title: "Customers", robots: { index: false } };

function safeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePage("order:manage");
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 80);
  const customers = await User.find({
    roles: "customer",
    ...(term
      ? {
          $or: [
            { name: new RegExp(safeRegex(term), "i") },
            { phone: new RegExp(safeRegex(term)) },
          ],
        }
      : {}),
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("name phone active createdAt");
  const ids = customers.map((customer) => customer._id);
  const [orders, addresses] = await Promise.all([
    Order.find({ customerId: { $in: ids } })
      .select("customerId number totalPaise paymentStatus createdAt")
      .sort({ createdAt: -1 }),
    Address.find({ customerId: { $in: ids } }).select("customerId"),
  ]);
  const ordersFor = (id: unknown) =>
    orders.filter((order) => String(order.customerId) === String(id));
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Customers"
        lead="Who orders from the store, how much and how recently, for support and delivery questions."
      />
      <FilterBar label="Find customers" submitLabel="Find" clearHref={term ? "/admin/customers" : undefined}>
        <label>
          Name or phone
          <input name="q" defaultValue={term} maxLength={80} placeholder="Priya or 98765" />
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{customers.length}</strong> {customers.length === 1 ? "customer" : "customers"}
          {term ? ` matching “${term}”` : ", newest first"}
          {customers.length === 100 ? " (the first 100)" : ""}
        </span>
      </p>
      <DataTable
        caption="Customers with order counts, paid value, saved addresses and their latest order"
        rows={customers}
        rowKey={(customer) => String(customer._id)}
        columns={[
          {
            header: "Customer",
            cell: (customer) => (
              <>
                <strong>{customer.name}</strong>
                <small>
                  {customer.phone ? `+91 ••••••${customer.phone.slice(-4)}` : "Google sign-in, no mobile yet"}
                </small>
              </>
            ),
          },
          {
            header: "Orders",
            numeric: true,
            cell: (customer) => ordersFor(customer._id).length,
          },
          {
            header: "Paid value",
            numeric: true,
            cell: (customer) =>
              formatPrice(
                ordersFor(customer._id)
                  .filter((order) =>
                    ["paid", "partially-refunded", "refunded"].includes(
                      order.paymentStatus,
                    ),
                  )
                  .reduce((sum, order) => sum + order.totalPaise, 0),
              ),
          },
          {
            header: "Addresses",
            numeric: true,
            cell: (customer) =>
              addresses.filter(
                (address) => String(address.customerId) === String(customer._id),
              ).length,
          },
          {
            header: "Last order",
            cell: (customer) => {
              const latest = ordersFor(customer._id)[0];
              return latest ? (
                <Link href={`/admin/orders/${latest._id}`}>{latest.number}</Link>
              ) : (
                "—"
              );
            },
          },
        ]}
        empty={
          <EmptyState
            icon={UsersRound}
            title="No matching customers"
            body="Try another name or phone number."
          />
        }
      />
    </section>
  );
}
