import Link from "next/link";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { MoreHorizontal, NotebookPen } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MoneyInput } from "@/components/money-input";
import { PageHeading } from "@/components/page-heading";
import { Popover } from "@/components/popover";
import { RecordHistory } from "@/components/record-history";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models";
import { Order } from "@/lib/commerce/models";
import { Family, TabPayment } from "@/lib/family/models";
import { tabBalance } from "@/lib/family/checkout";
import { tabAction } from "@/lib/family/staff-actions";
import { formatPrice } from "@/lib/display";
export const metadata = { title: "Family tabs", robots: { index: false } };

const STATUSES = ["requested", "active", "paused", "closed"] as const;
const TONE = { requested: "warn", active: "ok", paused: "warn", closed: "neutral" } as const;

type FamilyRow = {
  _id: unknown;
  name: string;
  ownerId: unknown;
  adults: unknown[];
  tab: { status: (typeof STATUSES)[number]; limitPaise?: number; requestedAt?: Date; lastPaymentAt?: Date };
};

/** One owner decision as its own small form, so each button says exactly what it does. */
function Decide({
  familyId,
  decision,
  submit,
  confirm,
  limit,
  secondary,
}: {
  familyId: string;
  decision: string;
  submit: string;
  confirm: string;
  limit?: number;
  secondary?: boolean;
}) {
  return (
    <ActionForm
      action={tabAction}
      submit={submit}
      confirmMessage={confirm}
      className="form-stack tab-decision"
      buttonClassName={secondary ? "secondary-button" : "primary-button"}
    >
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="decision" value={decision} />
      {limit !== undefined && (
        <label>
          Tab limit
          <MoneyInput name="limitRupees" defaultValue={limit || undefined} />
        </label>
      )}
    </ActionForm>
  );
}

export default async function TabsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; family?: string }>;
}) {
  const user = await requirePage("cod:reconcile");
  const owner = hasPermission(user.roles, "tab:approve");
  const { q = "", status = "", family: selectedId } = await searchParams;
  await connectDB();
  const filter: Record<string, unknown> = {
    "tab.status": (STATUSES as readonly string[]).includes(status) ? status : { $exists: true },
  };
  if (q.trim()) filter.name = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const families: FamilyRow[] = await Family.find(filter).sort({ "tab.requestedAt": -1 }).limit(100).select("name ownerId adults tab");
  const [balances, owners] = await Promise.all([
    Promise.all(families.map((f) => tabBalance(f._id))),
    User.find({ _id: { $in: families.map((f) => f.ownerId) } }).select("name phone"),
  ]);
  const balanceOf = (f: FamilyRow) => balances[families.indexOf(f)];
  const ownerOf = (f: FamilyRow) => owners.find((o) => String(o._id) === String(f.ownerId));
  const selected =
    selectedId && mongoose.isValidObjectId(selectedId) ? await Family.findOne({ _id: selectedId, "tab.status": { $exists: true } }) : null;
  const [balance, payments, orders, adults] = selected
    ? await Promise.all([
        tabBalance(selected._id),
        TabPayment.find({ familyId: selected._id }).sort({ createdAt: -1 }).limit(20),
        Order.find({ familyId: selected._id, paymentMethod: "tab" }).sort({ createdAt: -1 }).limit(20).select("number totalPaise orderStatus deliveryStatus createdAt"),
        User.find({ _id: { $in: selected.adults } }).select("name phone"),
      ])
    : [null, [], [], []];
  const id = selected ? String(selected._id) : "";
  const tabStatus = selected?.tab.status as (typeof STATUSES)[number] | undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Family tabs"
        lead="Families who order now and settle once a month. Record what they pay; the owner opens tabs and sets each limit."
        aside={<span className="live-chip">{families.length} shown</span>}
      />
      {selected && balance && (
        <div className="panel adjust-panel" id="family">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                <StatusPill value={tabStatus} tone={TONE[tabStatus!]} />
              </span>
              <h2>{selected.name}</h2>
            </div>
            <Link href="/admin/tabs" className="text-button">
              Close
            </Link>
          </div>
          <p className="muted">
            {adults.map((a) => `${a.name}${a.phone ? ` (+91 ••••••${a.phone.slice(-4)})` : ""}`).join(" · ")}
          </p>
          <div className="analytics-cards tab-figures">
            <article className="panel">
              <small>Owed</small>
              <strong>{formatPrice(Math.max(0, balance.owedPaise))}</strong>
            </article>
            <article className="panel">
              <small>{balance.overdue ? "Overdue from before this month" : "Due from before this month"}</small>
              <strong>{formatPrice(balance.duePaise)}</strong>
            </article>
            <article className="panel">
              <small>Limit</small>
              <strong>{formatPrice(selected.tab.limitPaise ?? 0)}</strong>
            </article>
          </div>
          {balance.owedPaise > 0 && (
            <ActionForm
              action={tabAction}
              submit="Record payment"
              confirmMessage="This takes the amount off what the family owes, and tells them. Check the cash or the UPI reference first."
            >
              <input type="hidden" name="intent" value="payment" />
              <input type="hidden" name="familyId" value={id} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="staff-form-grid">
                <label>
                  Amount received
                  <MoneyInput name="amountRupees" />
                </label>
                <label>
                  Paid by
                  <select name="method" defaultValue="cash">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                </label>
                <label>
                  Reference <small>The UPI reference number; optional for cash</small>
                  <input name="reference" maxLength={80} inputMode="numeric" autoComplete="off" />
                </label>
              </div>
            </ActionForm>
          )}
          {owner && (
            <div className="tab-decisions">
              {tabStatus === "requested" && (
                <Decide familyId={id} decision="approve" submit="Open the tab" confirm="The family can put orders on the tab up to this limit." limit={0} />
              )}
              {(tabStatus === "active" || tabStatus === "paused") && (
                <Decide
                  familyId={id}
                  decision="limit"
                  submit="Change the limit"
                  confirm="The family is told the new limit."
                  limit={(selected.tab.limitPaise ?? 0) / 100}
                  secondary
                />
              )}
              {tabStatus === "active" && (
                <Decide familyId={id} decision="pause" submit="Pause the tab" confirm="New orders can't go on the tab until you reopen it." secondary />
              )}
              {tabStatus === "paused" && (
                <Decide familyId={id} decision="resume" submit="Reopen the tab" confirm="Orders can go on the tab again." secondary />
              )}
              {tabStatus !== "closed" && (
                <Decide
                  familyId={id}
                  decision="close"
                  submit="Close the tab"
                  confirm="New orders can't go on it. Anything owed is still collected here."
                  secondary
                />
              )}
            </div>
          )}
          <h3 className="share-subhead">Payments</h3>
          {payments.length ? (
            <ul className="kit-lines">
              {payments.map((payment) => (
                <li key={String(payment._id)}>
                  <span>
                    <strong>{formatPrice(payment.amountPaise)}</strong> · {payment.method === "upi" ? `UPI ${payment.reference}` : "Cash"} ·{" "}
                    <When at={payment.createdAt} />
                    {payment.voidedAt && <small> · voided: {payment.voidReason}</small>}
                  </span>
                  {owner && !payment.voidedAt && (
                    <Popover className="overflow-menu" label="Correct this payment" summary={<MoreHorizontal size={20} aria-hidden="true" />}>
                      <ActionForm
                        action={tabAction}
                        submit="Void this payment"
                        className="form-stack tab-void"
                        buttonClassName="secondary-button"
                        confirmMessage="The amount goes back onto what the family owes, and they are told why."
                      >
                        <input type="hidden" name="intent" value="void" />
                        <input type="hidden" name="paymentId" value={String(payment._id)} />
                        <label>
                          Why is it wrong?
                          <input name="reason" minLength={3} maxLength={200} required />
                        </label>
                      </ActionForm>
                    </Popover>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No payments yet.</p>
          )}
          <h3 className="share-subhead">Orders on the tab</h3>
          {orders.length ? (
            <ul className="kit-lines">
              {orders.map((order) => (
                <li key={String(order._id)}>
                  <Link href={`/admin/orders/${order._id}`}>{order.number}</Link>
                  <span>
                    {formatPrice(order.totalPaise)} <StatusPill value={order.orderStatus === "cancelled" ? "cancelled" : order.deliveryStatus} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing on the tab yet.</p>
          )}
          <RecordHistory target={id} />
        </div>
      )}
      <FilterBar label="Filter family tabs" clearHref="/admin/tabs">
        <label>
          Family
          <input name="q" defaultValue={q} maxLength={40} placeholder="Search families" />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="">Any</option>
            <option value="requested">Asked for</option>
            <option value="active">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </FilterBar>
      <DataTable
        caption="Family tabs with status, limit, what is owed, what is due and the last payment"
        rows={families}
        rowKey={(f) => String(f._id)}
        columns={[
          {
            header: "Family",
            cell: (f) => (
              <Link href={`/admin/tabs?family=${f._id}#family`}>
                <strong>{f.name}</strong> <small>{ownerOf(f)?.name ?? ""}</small>
              </Link>
            ),
          },
          { header: "Status", cell: (f) => <StatusPill value={f.tab.status} tone={TONE[f.tab.status]} /> },
          { header: "Limit", numeric: true, cell: (f) => formatPrice(f.tab.limitPaise ?? 0) },
          { header: "Owed", numeric: true, cell: (f) => formatPrice(Math.max(0, balanceOf(f).owedPaise)) },
          {
            header: "Due",
            numeric: true,
            cell: (f) =>
              balanceOf(f).overdue ? (
                <StatusPill tone="bad">Overdue {formatPrice(balanceOf(f).duePaise)}</StatusPill>
              ) : (
                formatPrice(balanceOf(f).duePaise)
              ),
          },
          { header: "Last payment", cell: (f) => (f.tab.lastPaymentAt ? <When at={f.tab.lastPaymentAt} /> : "—") },
        ]}
        empty={
          <EmptyState
            icon={NotebookPen}
            heading="h3"
            title={q || status ? "No tabs match" : "No family tabs yet"}
            body={
              q || status
                ? "Try another family name or status."
                : "A family's owner asks for a tab from their Family page. It shows up here for the owner to open."
            }
          />
        }
      />
    </section>
  );
}
