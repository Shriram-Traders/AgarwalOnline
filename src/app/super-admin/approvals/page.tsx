import Link from "next/link";
import mongoose from "mongoose";
import { ApprovalDetails } from "@/components/approval-details";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { Category, Product, ProductVariant, User } from "@/lib/db/models";
import { StatusPill, type Tone } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { ApprovalRequest, ApprovalHistory } from "@/lib/governance/models";
import { publishScheduled } from "@/lib/governance/service";
import { ActionForm } from "@/components/action-form";
import { governanceAction } from "@/lib/governance/actions";
import { formatIst } from "@/lib/display";
export const metadata = { title: "Approvals", robots: { index: false } };

const VIEWS = {
  waiting: { label: "Waiting for a decision", match: { state: "pending" } },
  scheduled: { label: "Approved for later", match: { state: "approved" } },
  decided: {
    label: "Decided",
    match: { state: { $in: ["published", "rejected", "withdrawn", "failed"] } },
  },
  all: { label: "Everything", match: {} },
} as const;
type View = keyof typeof VIEWS;
const STATES: Record<string, [string, Tone]> = {
  pending: ["Waiting", "warn"],
  approved: ["Approved for later", "warn"],
  published: ["Live", "ok"],
  rejected: ["Rejected", "bad"],
  withdrawn: ["Withdrawn", "neutral"],
  failed: ["Could not apply", "bad"],
};

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; review?: string }>;
}) {
  const user = await requirePage("approval:review");
  // changes approved for a later time go live when their time comes, without waiting for the daily job
  await publishScheduled();
  const params = await searchParams;
  const view = (params.view && params.view in VIEWS ? params.view : "waiting") as View;
  const [categories, requests, counts, owners] = await Promise.all([
    Category.find({}).select("name"),
    ApprovalRequest.find(VIEWS[view].match).sort({ createdAt: view === "waiting" ? 1 : -1 }).limit(200),
    Promise.all((Object.keys(VIEWS) as View[]).map((key) => ApprovalRequest.countDocuments(VIEWS[key].match))),
    User.countDocuments({ roles: "super-admin", active: true }),
  ]);
  const reviewing =
    params.review && mongoose.isValidObjectId(params.review)
      ? (requests.find((request) => String(request._id) === params.review) ??
        (await ApprovalRequest.findById(params.review)))
      : undefined;
  const all = reviewing && !requests.some((r) => String(r._id) === String(reviewing._id)) ? [...requests, reviewing] : requests;
  const [history, people, packs] = await Promise.all([
    reviewing ? ApprovalHistory.find({ requestId: reviewing._id }).sort({ at: 1 }) : [],
    User.find({ _id: { $in: [...new Set(all.flatMap((r) => [String(r.requesterId), String(r.reviewerId ?? r.requesterId)]))] } }).select(
      "name",
    ),
    // price and stock requests point at a pack; name the product so the reviewer knows what is changing
    ProductVariant.find({
      _id: { $in: all.filter((r) => r.kind === "price" || r.kind === "stock").map((r) => r.targetId) },
    }).select("productId label"),
  ]);
  const products = await Product.find({
    _id: {
      $in: [
        ...packs.map((pack) => pack.productId),
        ...all.filter((r) => r.kind === "variant").map((r) => r.after.productId),
      ],
    },
  }).select("name");
  const nameOf = (id: unknown) => people.find((person) => String(person._id) === String(id))?.name ?? "Someone";
  const titleFor = (r: { kind: string; targetId: unknown; after: Record<string, string> }) => {
    if (r.kind === "product") return `New product: ${r.after.nameEn}`;
    if (r.kind === "variant") {
      const product = products.find((item) => String(item._id) === String(r.after.productId));
      return `New pack: ${product?.name.en ?? "a product"} · ${r.after.label}`;
    }
    const pack = packs.find((item) => String(item._id) === String(r.targetId));
    const product = products.find((item) => String(item._id) === String(pack?.productId));
    return `${r.kind === "price" ? "Price change" : "Stock change"}: ${product?.name.en ?? "a product"}${pack ? ` · ${pack.label}` : ""}`;
  };
  const href = (extra: Record<string, string>) =>
    `/super-admin/approvals?${new URLSearchParams({ ...(view !== "waiting" ? { view } : {}), ...extra })}`;
  const ownRequest = reviewing && String(reviewing.requesterId) === user.id;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Approvals"
        lead={
          owners > 1
            ? "New products, new packs, price changes and large stock changes wait here until another owner approves them."
            : "You are the only owner, so your own changes apply at once. Changes your staff ask for wait here for you."
        }
        aside={<span className="live-chip">{counts[0]} waiting</span>}
      />
      {reviewing && (
        <div className="panel adjust-panel" id="review">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                Asked by {nameOf(reviewing.requesterId)} · <When at={reviewing.createdAt} />
              </span>
              <h2>{titleFor(reviewing)}</h2>
            </div>
            <Link href={href({})} className="text-button">
              Close
            </Link>
          </div>
          <p>
            <StatusPill tone={(STATES[reviewing.state] ?? ["", "neutral"])[1]}>
              {(STATES[reviewing.state] ?? [reviewing.state])[0]}
            </StatusPill>{" "}
            {reviewing.state === "approved" && reviewing.scheduledAt && (
              <span className="muted">Goes live {formatIst(reviewing.scheduledAt)}</span>
            )}
          </p>
          {reviewing.state === "failed" && reviewing.failureReason && (
            <p className="error-message">Could not apply: {reviewing.failureReason}</p>
          )}
          {reviewing.reason && reviewing.state !== "pending" && (
            <p className="muted">Note from {nameOf(reviewing.reviewerId)}: {reviewing.reason}</p>
          )}
          <div className="approval-values">
            <div>
              <h3>Before</h3>
              <ApprovalDetails values={reviewing.before} />
            </div>
            <div>
              <h3>Requested change</h3>
              <ApprovalDetails
                values={reviewing.after}
                categoryName={categories.find((c) => String(c._id) === String(reviewing.after.categoryId))?.name.en}
              />
            </div>
          </div>
          {reviewing.state === "pending" && (!ownRequest || owners === 1) ? (
            <ActionForm
              action={governanceAction}
              submit="Record decision"
              confirmMessage="Approving publishes the change at the time you chose, or straight away; rejecting sends it back to the person who asked."
            >
              <input type="hidden" name="operation" value="review" />
              <input type="hidden" name="requestId" value={String(reviewing._id)} />
              <fieldset className="day-picker">
                <legend>Decision</legend>
                <label className="checkbox-label">
                  <input type="radio" name="decision" value="approved" defaultChecked /> Approve
                </label>
                <label className="checkbox-label">
                  <input type="radio" name="decision" value="rejected" /> Reject
                </label>
              </fieldset>
              <label>
                Note <small>Needed when you reject, so they know what to fix</small>
                <textarea name="comment" maxLength={500} />
              </label>
              <label>
                Publish at <small>Optional; leave empty to publish as soon as you approve</small>
                <input name="scheduledAt" type="datetime-local" />
              </label>
            </ActionForm>
          ) : reviewing.state === "pending" ? (
            <p className="notice">You asked for this change, so another owner has to review it.</p>
          ) : null}
          {reviewing.state === "pending" && (
            <ActionForm
              action={governanceAction}
              submit="Withdraw request"
              className="form-stack inline-grant approval-withdraw"
              buttonClassName="secondary-button"
            >
              <input type="hidden" name="operation" value="withdraw" />
              <input type="hidden" name="requestId" value={String(reviewing._id)} />
            </ActionForm>
          )}
          {history.length > 0 && (
            <details className="record-history" open>
              <summary>What happened</summary>
              <ul>
                {history.map((h) => (
                  <li key={String(h._id)}>
                    <strong>{(STATES[String(h.next)] ?? [String(h.next)])[0]}</strong> · {nameOf(h.actorId)} ·{" "}
                    {formatIst(h.at)}
                    {h.comment ? ` · ${h.comment}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <FilterBar label="Show approvals" submitLabel="Show">
        <label>
          Show
          <select name="view" defaultValue={view}>
            {(Object.keys(VIEWS) as View[]).map((key, index) => (
              <option key={key} value={key}>
                {VIEWS[key].label} ({counts[index]})
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line">
        <span>
          <strong>{requests.length}</strong> {VIEWS[view].label.toLowerCase()}
        </span>
      </p>
      <DataTable
        caption="Change requests with who asked, when and where they stand"
        rows={requests}
        rowKey={(request) => String(request._id)}
        columns={[
          {
            header: "Change",
            cell: (request) => <Link href={`${href({ review: String(request._id) })}#review`}>{titleFor(request)}</Link>,
          },
          { header: "Asked by", cell: (request) => nameOf(request.requesterId) },
          { header: "When", cell: (request) => <When at={request.createdAt} /> },
          {
            header: "Status",
            cell: (request) => {
              const [label, tone] = STATES[request.state] ?? [request.state, "neutral"];
              return <StatusPill tone={tone}>{label}</StatusPill>;
            },
          },
        ]}
        empty={
          <EmptyState
            icon={ClipboardCheck}
            title={view === "waiting" ? "Nothing waiting" : "Nothing here"}
            body="New products, new packs, price changes and large stock changes appear here when someone asks for them."
            heading="h3"
          />
        }
      />
    </section>
  );
}
