import Link from "next/link";
import type { Model } from "mongoose";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { InventoryItem } from "@/lib/db/models";
import { CODCollection } from "@/lib/operations/models";
import { ChatConversation } from "@/lib/chat/models";
import { Complaint } from "@/lib/aftercare/models";
import { ApprovalRequest } from "@/lib/governance/models";
import { Refund } from "@/lib/payments/models";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import {
  Boxes,
  Inbox,
  PackagePlus,
  Settings,
  Sparkles,
  Store,
  UserCog,
  UsersRound,
} from "lucide-react";
import { formatPrice } from "@/lib/display";
import { PageHeading } from "@/components/page-heading";
import { StatTiles } from "@/components/stat-tiles";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
export const metadata = { title: "Overview & orders", robots: { index: false } };

/** The order list's filters: what the counter asks "what's waiting at this step?" */
const FILTERS = {
  "to-confirm": { label: "To confirm", match: { orderStatus: "placed" } },
  packing: {
    label: "Packing",
    match: { orderStatus: { $ne: "cancelled" }, fulfilmentStatus: { $in: ["picking", "packed"] } },
  },
  ready: { label: "Ready, no rider", match: { fulfilmentStatus: "ready", deliveryStatus: "unassigned" } },
  "on-the-way": {
    label: "On the way",
    match: { deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] } },
  },
  delivered: { label: "Delivered", match: { deliveryStatus: "delivered" } },
  cancelled: { label: "Cancelled", match: { orderStatus: "cancelled" } },
} as const;
type Filter = keyof typeof FILTERS;

/** Each queue: how many items wait, and how long the oldest has waited. */
type Queue = { label: string; href: string; count: number; oldest: Date | null };
async function queue(
  label: string,
  href: string,
  model: Model<unknown>,
  filter: object,
  sortField: string,
): Promise<Queue> {
  const [count, oldest] = await Promise.all([
    model.countDocuments(filter),
    model.findOne(filter).sort({ [sortField]: 1 }).select(sortField).lean() as Promise<
      Record<string, Date> | null
    >,
  ]);
  return { label, href, count, oldest: oldest?.[sortField] ?? null };
}
function waitingFor(since: Date | null) {
  if (!since) return "clear";
  const minutes = Math.max(1, Math.round((Date.now() - since.getTime()) / 60000));
  if (minutes < 60) return `oldest waiting ${minutes} min`;
  if (minutes < 60 * 24) return `oldest waiting ${Math.round(minutes / 60)} h`;
  return `oldest waiting ${Math.round(minutes / 1440)} d`;
}

/** Orders and sales placed in [from, to), cancellations left out. */
async function takings(from: Date, to: Date) {
  const [row] = await Order.aggregate<{ orders: number; sales: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, orderStatus: { $ne: "cancelled" } } },
    { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: "$totalPaise" } } },
  ]);
  return row ?? { orders: 0, sales: 0 };
}

const IST = "Asia/Kolkata";
function startOfTodayIST(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(now);
  return new Date(`${day}T00:00:00+05:30`);
}
function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requirePage("order:manage");
  const owner = user.roles.includes("super-admin");
  const { status, q } = await searchParams;
  const filter = (status && status in FILTERS ? status : null) as Filter | null;
  const term = q?.trim().slice(0, 60);
  // order number, customer name or phone
  const search = term
    ? { $or: ["number", "address.name", "address.phone"].map((field) => ({ [field]: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })) }
    : {};
  const orderHref = (step: Filter | null) => {
    const query = new URLSearchParams({ ...(step ? { status: step } : {}), ...(term ? { q: term } : {}) }).toString();
    return `/admin${query ? `?${query}` : ""}#orders`;
  };
  const now = new Date();
  const todayStart = startOfTodayIST(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  const [orders, counts, today, yesterday, lowStock, lowCount, cashOpen, queues] = await Promise.all([
    Order.find({ ...(filter ? FILTERS[filter].match : {}), ...search }).sort({ createdAt: -1 }).limit(50),
    Promise.all((Object.keys(FILTERS) as Filter[]).map((key) => Order.countDocuments(FILTERS[key].match))),
    takings(todayStart, now),
    takings(yesterdayStart, todayStart),
    InventoryItem.aggregate<{ _id: unknown; available: number; label: string; name: string }>([
      { $addFields: { available: { $subtract: ["$onHand", "$reserved"] } } },
      { $match: { available: { $lte: 10 } } },
      { $sort: { available: 1 } },
      { $limit: 6 },
      { $lookup: { from: "productvariants", localField: "variantId", foreignField: "_id", as: "variant" } },
      { $unwind: "$variant" },
      { $lookup: { from: "products", localField: "variant.productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { available: 1, label: "$variant.label", name: "$product.name.en" } },
    ]),
    InventoryItem.countDocuments({ $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 10] } }),
    CODCollection.find({ reconciledAt: null }).select("collectedPaise"),
    Promise.all([
      queue("Orders to confirm", "/admin?status=to-confirm#orders", Order, FILTERS["to-confirm"].match, "createdAt"),
      queue("Orders being packed", "/admin?status=packing#orders", Order, FILTERS.packing.match, "updatedAt"),
      queue("Packed, no rider assigned", "/admin?status=ready#orders", Order, FILTERS.ready.match, "updatedAt"),
      queue("Cash collections to reconcile", "/admin/cod", CODCollection, { reconciledAt: null }, "createdAt"),
      queue("Support chats waiting for a reply", "/admin/support", ChatConversation, { status: "waiting-support" }, "updatedAt"),
      queue("Open complaints", "/admin/complaints", Complaint, { status: "open" }, "createdAt"),
      ...(owner
        ? [
            queue("Changes waiting for your approval", "/super-admin/approvals", ApprovalRequest, { state: "pending" }, "createdAt"),
            queue("Refunds in progress", "/super-admin/refunds", Refund, { status: { $in: ["requested", "processing"] } }, "createdAt"),
          ]
        : []),
    ]),
  ]);
  const cash = cashOpen.reduce((sum, item) => sum + item.collectedPaise, 0);
  const quickActions = [
    { href: "/admin/products/new", label: "Add a product", icon: PackagePlus },
    { href: "/admin/inventory", label: "Adjust stock", icon: Boxes },
    { href: "/admin/customers", label: "Find a customer", icon: UsersRound },
    ...(owner
      ? [
          { href: "/super-admin/promotions", label: "Create an offer", icon: Sparkles },
          { href: "/super-admin/staff", label: "Add staff", icon: UserCog },
          { href: "/super-admin", label: "Store settings", icon: Settings },
        ]
      : []),
    { href: "/", label: "View the shop", icon: Store },
  ];
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Store workspace"
        title={`${greeting(now)}, ${user.name}`}
        lead="What needs you first, then today’s numbers and orders."
        aside={
          <span className="live-chip">
            <i /> Refreshes when you come back
          </span>
        }
      />
      <nav className="quick-actions" aria-label="Quick actions">
        {quickActions.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="secondary-button">
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Work queue</span>
            <h2>Waiting on the team</h2>
          </div>
        </div>
        <ul className="work-queue">
          {queues.map((item) => (
            <li key={item.label} className={item.count ? "" : "clear"}>
              <Link href={item.href}>
                <strong>{item.count}</strong>
                <span>{item.label}</span>
                <small>{waitingFor(item.oldest)}</small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <RefreshOnFocus />
      <StatTiles
        items={[
          { label: "Orders today", value: today.orders, note: `Yesterday ${yesterday.orders}` },
          { label: "Sales today", value: formatPrice(today.sales), note: `Yesterday ${formatPrice(yesterday.sales)}` },
          { label: "Packs running low", value: lowCount, href: "/admin/inventory" },
          { label: "Cash to reconcile", value: formatPrice(cash), href: "/admin/cod" },
        ]}
      />
      <div className="overview-split">
        <div className="panel" id="orders">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Orders</span>
              <h2>{filter ? FILTERS[filter].label : "Latest orders"}</h2>
            </div>
            <span className="order-count">{orders.length} shown</span>
          </div>
          <form className="order-search" role="search" aria-label="Find an order" action="/admin#orders">
            {filter && <input type="hidden" name="status" value={filter} />}
            <label className="sr-only" htmlFor="order-q">
              Order number, customer name or phone
            </label>
            <input id="order-q" name="q" defaultValue={term} placeholder="Order number, name or phone" maxLength={60} />
            <button className="secondary-button compact-button">Find</button>
            {term && (
              <Link href={filter ? `/admin?status=${filter}#orders` : "/admin#orders"} className="text-button">
                Clear
              </Link>
            )}
          </form>
          <nav className="catalog-chips order-filters" aria-label="Filter orders by step">
            <Link href={orderHref(null)} aria-current={!filter ? "page" : undefined}>
              All
            </Link>
            {(Object.keys(FILTERS) as Filter[]).map((key, index) => (
              <Link
                key={key}
                href={orderHref(key)}
                aria-current={filter === key ? "page" : undefined}
              >
                {FILTERS[key].label} ({counts[index]})
              </Link>
            ))}
          </nav>
          <DataTable
            bare
            caption="Orders with customer, delivery window, status and total"
            rows={orders}
            rowKey={(order) => String(order._id)}
            columns={[
              {
                header: "Order",
                cell: (order) => <Link href={`/admin/orders/${order._id}`}>{order.number}</Link>,
              },
              { header: "Customer", cell: (order) => order.address.name },
              {
                header: "Delivery",
                cell: (order) => `${order.deliveryDate} · ${order.deliveryWindow}`,
              },
              {
                header: "Order status",
                cell: (order) => <StatusPill value={order.orderStatus} />,
              },
              {
                header: "Payment",
                cell: (order) => (
                  <>
                    {order.paymentMethod.toUpperCase()} <StatusPill value={order.paymentStatus} />
                  </>
                ),
              },
              {
                header: "Total",
                numeric: true,
                cell: (order) => formatPrice(order.totalPaise),
              },
            ]}
            empty={
              <EmptyState
                icon={Inbox}
                title={term ? `No orders match “${term}”` : filter ? "Nothing at this step" : "No orders yet"}
                body={
                  term
                    ? "Check the order number, or search by the customer’s name or phone."
                    : filter
                      ? "Orders move here as the team works through them."
                      : "New orders land here the moment a customer checks out."
                }
                heading="h3"
              />
            }
          />
          <p className="muted">
            Open an order to confirm, pack, assign delivery or reconcile collected cash.
          </p>
        </div>
        <aside className="panel low-stock" aria-labelledby="low-stock-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Shelves</span>
              <h2 id="low-stock-title">Running low</h2>
            </div>
          </div>
          {lowStock.length ? (
            <ul>
              {lowStock.map((item) => (
                <li key={String(item._id)}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.label}</small>
                  </span>
                  <b className={item.available <= 0 ? "out" : undefined}>
                    {item.available <= 0 ? "Sold out" : `${item.available} left`}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Every pack has more than 10 in stock.</p>
          )}
          <Link href="/admin/inventory" className="text-button">
            Adjust stock
          </Link>
        </aside>
      </div>
    </section>
  );
}
