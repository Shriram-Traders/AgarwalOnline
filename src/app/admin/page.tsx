import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { Order } from "@/lib/commerce/models";
import { InventoryItem } from "@/lib/db/models";
import { CODCollection } from "@/lib/operations/models";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { ensureSlots, slotGaps } from "@/lib/commerce/slots";
import { CalendarClock, ChevronDown, CircleCheck, Inbox, Plus } from "lucide-react";
import { formatIst, formatPrice } from "@/lib/display";
import { PageHeading } from "@/components/page-heading";
import { Popover } from "@/components/popover";
import { StatTiles } from "@/components/stat-tiles";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { FILTERS, OWNER_FILTERS, type OrderFilter as Filter } from "@/lib/admin/order-filters";
import { loadQueues } from "@/lib/admin/work-queues";
export const metadata = { title: "Overview & orders", robots: { index: false } };

/** "waiting 3 h": how long the oldest item in a queue has been there. */
function waitingFor(since: Date, now: Date) {
  const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60000));
  if (minutes < 60) return `waiting ${minutes} min`;
  if (minutes < 60 * 24) return `waiting ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 1440);
  return `waiting ${days} ${days === 1 ? "day" : "days"}`;
}

/** The New menu: things people start from scratch, each shown only to those allowed to. */
const NEW_THINGS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin/products/new", label: "Add a product", permission: "catalog:write" },
  { href: "/admin/inventory", label: "Adjust stock", permission: "inventory:adjust" },
  { href: "/super-admin/promotions?edit=new#offer", label: "Create an offer", permission: "promotion:write" },
  { href: "/super-admin/staff#add", label: "Add staff", permission: "staff:manage" },
  { href: "/super-admin/schools?edit=new#school", label: "Add a school", permission: "settings:write" },
];

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
  const shownFilters = (Object.keys(FILTERS) as Filter[]).filter(
    (key) => owner || !OWNER_FILTERS.includes(key),
  );
  const filter = (status && shownFilters.includes(status as Filter) ? status : null) as Filter | null;
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
  await ensureSlots();

  const [orders, counts, today, yesterday, lowStock, lowCount, cashOpen, queues, gaps] = await Promise.all([
    Order.find({ ...(filter ? FILTERS[filter].match : {}), ...search }).sort({ createdAt: -1 }).limit(50),
    Promise.all(shownFilters.map((key) => Order.countDocuments(FILTERS[key].match))),
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
    loadQueues(user.roles, now),
    slotGaps(now),
  ]);
  const cash = cashOpen.reduce((sum, item) => sum + item.collectedPaise, 0);
  // what needs someone now, oldest first; the queues with nothing waiting fold into one line
  const waiting = queues
    .filter((item) => item.count > 0)
    .sort((a, b) => (a.oldest?.getTime() ?? Infinity) - (b.oldest?.getTime() ?? Infinity));
  const clear = queues.filter((item) => item.count === 0);
  const newThings = NEW_THINGS.filter((item) => hasPermission(user.roles, item.permission));
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title={`${greeting(now)}, ${user.name}`}
        lead={
          waiting.length
            ? `${waiting.length} ${waiting.length === 1 ? "thing needs" : "things need"} you. Oldest first; everything else is clear.`
            : "Nothing is waiting on the team. Today’s numbers and orders are below."
        }
        aside={
          <div className="overview-aside">
            <span className="live-chip">
              <i /> Refreshes when you come back
            </span>
            {newThings.length > 0 && (
              <Popover
                className="new-menu"
                summary={
                  <>
                    <Plus size={17} aria-hidden="true" /> New <ChevronDown size={16} aria-hidden="true" />
                  </>
                }
              >
                <ul>
                  {newThings.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </Popover>
            )}
          </div>
        }
      />
      {gaps.areas.length > 0 && gaps.date && (
        <p className="notice slot-gap" role="status">
          <CalendarClock size={16} aria-hidden="true" />
          <span>
            No delivery times to book in <strong>{gaps.areas.join(", ")}</strong> over the next two
            open days, so shoppers there can’t check out.{" "}
            {owner ? (
              <Link href="/super-admin#weekly">Add delivery times</Link>
            ) : (
              "Ask the owner to add delivery times."
            )}
          </span>
        </p>
      )}
      <section className="panel needs-you" id="needs-you" tabIndex={-1} aria-labelledby="needs-you-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Work queue</span>
            <h2 id="needs-you-title">Needs you now</h2>
          </div>
        </div>
        {waiting.length > 0 ? (
          <ol className="needs-list">
            {waiting.map((item) => (
              <li key={item.key} className="needs-row">
                <strong className="needs-count">{item.count}</strong>
                <div className="needs-what">
                  <Link href={item.listHref}>{item.label}</Link>
                  {item.oldest && (
                    <span
                      className={`wait-tag${item.late ? " is-late" : ""}`}
                      title={`Oldest since ${formatIst(item.oldest)}`}
                    >
                      {waitingFor(item.oldest, now)}
                    </span>
                  )}
                  <small>{item.note}</small>
                </div>
                <Link href={item.actionHref} className="primary-button compact-button needs-action">
                  {item.action}
                  <span className="sr-only">: {item.label.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="needs-none">
            <CircleCheck size={20} aria-hidden="true" /> Nothing is waiting. New orders, chats and complaints show up here.
          </p>
        )}
        {waiting.length > 0 && clear.length > 0 && (
          <p className="all-clear">
            <span>
              <CircleCheck size={16} aria-hidden="true" /> All clear:
            </span>
            {clear.map((item) => (
              <Link key={item.key} href={item.listHref}>
                {item.label}
              </Link>
            ))}
          </p>
        )}
      </section>
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
            {shownFilters.map((key, index) => (
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
