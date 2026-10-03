import { returnTransitions, aftercareLabel } from "@/lib/aftercare/transitions";
import { MessageSquareWarning } from "lucide-react";
import mongoose from "mongoose";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { Complaint, ReturnRequest } from "@/lib/aftercare/models";
import { Order } from "@/lib/commerce/models";
import { ActionForm } from "@/components/action-form";
import { aftercareAction } from "@/lib/aftercare/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
export const metadata = { title: "Complaints & returns", robots: { index: false } };

/** The staff words for a complaint's state; shoppers see "Sent to store" for a new one. */
const STATUS = {
  open: { label: "New", tone: "warn" },
  reviewing: { label: "Under review", tone: "neutral" },
  resolved: { label: "Resolved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
} as const;
const TYPES = ["missing-item", "damaged-item", "wrong-item", "other"] as const;
type Params = { view?: string; q?: string; status?: string; type?: string };

export default async function Complaints({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requirePage("complaint:manage");
  const params = await searchParams;
  const status = params.status && params.status in STATUS ? params.status : undefined;
  const type = TYPES.find((value) => value === params.type);
  const term = params.q?.trim().slice(0, 40);
  // the order number is the one thing people have in hand when a customer rings about a complaint
  const matching = term
    ? await Order.find({ number: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
        .select("_id")
        .limit(200)
    : null;
  const complaints = await Complaint.find({
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(matching ? { orderId: { $in: matching.map((order) => order._id) } } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(100);
  const viewing =
    params.view && mongoose.isValidObjectId(params.view)
      ? (complaints.find((c) => String(c._id) === params.view) ?? (await Complaint.findById(params.view)))
      : null;
  const ids = [...complaints.map((c) => c._id), ...(viewing ? [viewing._id] : [])];
  const [returns, orders, evidence] = await Promise.all([
    ReturnRequest.find({ complaintId: { $in: ids } }),
    Order.find({ _id: { $in: [...complaints, ...(viewing ? [viewing] : [])].map((c) => c.orderId) } }).select("number"),
    viewing ? UploadedEvidence.find({ complaintId: viewing._id }).sort({ createdAt: -1 }) : [],
  ]);
  const orderNumber = new Map(orders.map((order) => [String(order._id), order.number as string]));
  const returnFor = (id: unknown) => returns.find((r) => String(r.complaintId) === String(id));
  const filtered = Boolean(term || status || type);
  const query = new URLSearchParams(
    Object.entries({ q: term, status, type }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const listHref = `/admin/complaints${query ? `?${query}` : ""}`;
  const viewHref = (id: unknown) => {
    const next = new URLSearchParams(query);
    next.set("view", String(id));
    return `/admin/complaints?${next}#complaint`;
  };
  const open = await Complaint.countDocuments({ status: "open" });
  const r = viewing ? returnFor(viewing._id) : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Complaints & returns"
        lead="Problems customers reported with an order, and the returns that follow. Open one to reply and update it."
      />
      {viewing && (
        <div className="panel adjust-panel" id="complaint" tabIndex={-1}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                Order {orderNumber.get(String(viewing.orderId)) ?? "—"} · <When at={viewing.createdAt} />
              </span>
              <h2>{aftercareLabel(viewing.type)}</h2>
            </div>
            <Link href={listHref} className="text-button">
              Close
            </Link>
          </div>
          <p>
            <StatusPill tone={STATUS[viewing.status as keyof typeof STATUS]?.tone ?? "neutral"}>
              {STATUS[viewing.status as keyof typeof STATUS]?.label ?? viewing.status}
            </StatusPill>
          </p>
          <p>{viewing.description}</p>
          {evidence.length > 0 && (
            <div className="evidence-strip">
              {evidence.map((item, index) => (
                <a key={String(item._id)} href={item.url} target="_blank" rel="noreferrer">
                  Customer photo {evidence.length > 1 ? index + 1 : ""}
                </a>
              ))}
            </div>
          )}
          <div className="split-actions complaint-links">
            <Link href={`/admin/orders/${viewing.orderId}`} className="secondary-button compact-button">
              View the order
            </Link>
            {user.roles.includes("super-admin") && (
              <Link className="secondary-button compact-button" href={`/super-admin/refunds?order=${viewing.orderId}`}>
                Arrange refund
              </Link>
            )}
          </div>
          <div className={r ? "basket-layout" : undefined}>
            <div>
              {["open", "reviewing"].includes(viewing.status) ? (
                <ActionForm action={aftercareAction} submit="Update complaint">
                  <input type="hidden" name="operation" value="resolve" />
                  <input type="hidden" name="complaintId" value={String(viewing._id)} />
                  <label>
                    Status
                    <select name="status">
                      <option value="reviewing">Reviewing</option>
                      <option value="resolved">Resolved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label>
                    Customer-visible resolution
                    <textarea name="resolution" minLength={5} maxLength={2000} required />
                  </label>
                </ActionForm>
              ) : (
                <p>{viewing.resolution}</p>
              )}
            </div>
            {r && (
              <div>
                <h3>Return: {aftercareLabel(r.status)}</h3>
                {r.notes && <p>{r.notes}</p>}
                {(returnTransitions[r.status]?.length ?? 0) > 0 && (
                  <ActionForm action={aftercareAction} submit="Update return">
                    <input type="hidden" name="operation" value="return" />
                    <input type="hidden" name="returnId" value={String(r._id)} />
                    <label>
                      Next status
                      <select name="status">
                        {(returnTransitions[r.status] ?? []).map((s) => (
                          <option key={s} value={s}>
                            {aftercareLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pickup date
                      <input type="date" name="pickupDate" />
                    </label>
                    <label>
                      Customer-visible notes
                      <textarea name="notes" minLength={5} maxLength={1000} required />
                    </label>
                  </ActionForm>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <FilterBar label="Filter complaints" submitLabel="Show complaints" clearHref={filtered ? "/admin/complaints" : undefined}>
        <label>
          Order number
          <input name="q" defaultValue={term} maxLength={40} placeholder="AGS-20261003" />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Problem
          <select name="type" defaultValue={type ?? ""}>
            <option value="">Any problem</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {aftercareLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{complaints.length}</strong> {complaints.length === 1 ? "complaint" : "complaints"}
          {filtered ? " match" : ", newest first"}
          {open > 0 && !filtered && ` · ${open} new`}
        </span>
      </p>
      <DataTable
        caption="Complaints with their order, status, return and when they came in"
        rows={complaints}
        rowKey={(c) => String(c._id)}
        columns={[
          {
            header: "Complaint",
            cell: (c) => (
              <span className="product-cell">
                <span>
                  <Link href={viewHref(c._id)}>
                    <strong>{aftercareLabel(c.type)}</strong>
                  </Link>
                  <small className="clamp-line">{c.description}</small>
                </span>
              </span>
            ),
          },
          {
            header: "Order",
            cell: (c) => <Link href={`/admin/orders/${c.orderId}`}>{orderNumber.get(String(c.orderId)) ?? "Open order"}</Link>,
          },
          {
            header: "Status",
            cell: (c) => (
              <StatusPill tone={STATUS[c.status as keyof typeof STATUS]?.tone ?? "neutral"}>
                {STATUS[c.status as keyof typeof STATUS]?.label ?? c.status}
              </StatusPill>
            ),
          },
          {
            header: "Return",
            cell: (c) => {
              const ret = returnFor(c._id);
              return ret ? aftercareLabel(ret.status) : "None";
            },
          },
          { header: "Came in", cell: (c) => <When at={c.createdAt} /> },
        ]}
        empty={
          <EmptyState
            icon={MessageSquareWarning}
            title={filtered ? "No complaint matches" : "Nothing to resolve"}
            body={filtered ? "Check the order number, or clear the filters." : "Complaints and return requests land here."}
            heading="h3"
          />
        }
      />
    </section>
  );
}
