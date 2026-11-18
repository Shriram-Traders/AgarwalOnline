import Link from "next/link";
import mongoose from "mongoose";
import { ApprovalDetails } from "@/components/approval-details";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { Category, Product, ProductVariant, User, parentsOf } from "@/lib/db/models";
import { StatusPill, type Tone } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { ApprovalRequest, ApprovalHistory } from "@/lib/governance/models";
import { publishScheduled } from "@/lib/governance/service";
import { ActionForm } from "@/components/action-form";
import { governanceAction } from "@/lib/governance/actions";
import { formatIst } from "@/lib/display";
import { Provider } from "@/lib/providers/models";
import { MoneyInput } from "@/components/money-input";
import { AudienceAndTaxFields, PackFields, ProductDetailsFields } from "@/components/request-fields";
import { hasPermission } from "@/lib/auth/permissions";
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
const isDelete = (kind: string) => kind === "delete-pack" || kind === "delete-product";
/** Requests whose details an owner can change before approving (see EDITS in governance/service). */
const EDITABLE = new Set(["product", "variant", "price", "stock"]);
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
  // purchase and school prices are for those who may set them
  const owner = hasPermission(user.roles, "settings:write");
  // changes approved for a later time go live when their time comes, without waiting for the daily job
  await publishScheduled();
  const params = await searchParams;
  const view = (params.view && params.view in VIEWS ? params.view : "waiting") as View;
  const [categories, requests, counts, waitingProviders] = await Promise.all([
    Category.find({}).select("name parentIds"),
    ApprovalRequest.find(VIEWS[view].match).sort({ createdAt: view === "waiting" ? 1 : -1 }).limit(200),
    Promise.all((Object.keys(VIEWS) as View[]).map((key) => ApprovalRequest.countDocuments(VIEWS[key].match))),
    // providers staff added wait on their own page; say so here, where owners come to decide
    Provider.countDocuments({ status: "pending" }),
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
      _id: { $in: all.filter((r) => r.kind === "price" || r.kind === "stock" || r.kind === "delete-pack").map((r) => r.targetId) },
    }).select("productId label"),
  ]);
  const products = await Product.find({
    _id: {
      $in: [
        ...packs.map((pack) => pack.productId),
        ...all.filter((r) => r.kind === "variant").map((r) => r.after.productId),
        ...all.filter((r) => r.kind === "delete-product").map((r) => r.targetId),
      ],
    },
  }).select("name");
  const provider = reviewing?.after?.providerId
    ? await Provider.findById(reviewing.after.providerId).select("name town status")
    : null;
  // tax and billing requests point at a provider
  const billedProviders = await Provider.find({
    _id: { $in: all.filter((r) => r.kind === "provider-billing").map((r) => r.targetId) },
  }).select("name town");
  const reviewingProvider = provider
    ? `${provider.name}, ${provider.town}${provider.status === "pending" ? " (new: approve it on the Providers page first)" : provider.status === "declined" ? " (declined)" : ""}`
    : undefined;
  // a product goes on a shelf; a section only groups shelves
  const sectionIds = new Set(categories.flatMap((item) => parentsOf(item)));
  const shelves = categories.filter((item) => !sectionIds.has(String(item._id))).map((item) => ({ id: String(item._id), name: item.name.en }));
  const editable = reviewing?.state === "pending" && EDITABLE.has(reviewing.kind);
  const nameOf = (id: unknown) => people.find((person) => String(person._id) === String(id))?.name ?? "Someone";
  const titleFor = (r: { kind: string; targetId: unknown; after: Record<string, string> }) => {
    if (r.kind === "product") return `New product: ${r.after.nameEn}`;
    if (r.kind === "variant") {
      const product = products.find((item) => String(item._id) === String(r.after.productId));
      return `New pack: ${product?.name.en ?? "a product"} · ${r.after.label}`;
    }
    if (r.kind === "delete-product")
      return `Delete product: ${products.find((item) => String(item._id) === String(r.targetId))?.name.en ?? "a product"}`;
    if (r.kind === "provider-billing") {
      const shop = billedProviders.find((item) => String(item._id) === String(r.targetId));
      return `Provider tax details: ${shop ? `${shop.name}, ${shop.town}` : "a provider"}`;
    }
    const pack = packs.find((item) => String(item._id) === String(r.targetId));
    const product = products.find((item) => String(item._id) === String(pack?.productId));
    const change = r.kind === "price" ? "Price change" : r.kind === "delete-pack" ? "Delete pack" : "Stock change";
    return `${change}: ${product?.name.en ?? "a product"}${pack ? ` · ${pack.label}` : ""}`;
  };
  // "Live" reads wrongly for something that has just left the shop
  const stateOf = (kind: string, state: string): [string, Tone] =>
    isDelete(kind) && state === "published" ? ["Deleted", "ok"] : (STATES[state] ?? [state, "neutral"]);
  const href = (extra: Record<string, string>) =>
    `/super-admin/approvals?${new URLSearchParams({ ...(view !== "waiting" ? { view } : {}), ...extra })}`;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Approvals"
        lead="Your own changes apply at once. New products, packs, prices, stock removals, large stock additions, deletes and providers' tax details your staff ask for wait here for you."
        aside={<span className="live-chip">{counts[0]} waiting</span>}
      />
      {waitingProviders > 0 && (
        <p className="notice" role="status">
          Also waiting:{" "}
          <Link href="/admin/providers?status=pending">
            <strong>{waitingProviders}</strong> new {waitingProviders === 1 ? "provider" : "providers"} to approve
          </Link>
          . Approve a provider before the products that name it.
        </p>
      )}
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
            <StatusPill tone={stateOf(reviewing.kind, reviewing.state)[1]}>{stateOf(reviewing.kind, reviewing.state)[0]}</StatusPill>{" "}
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
            {/* a waiting request's details are in the form below, to change if needed; photos and provider stay as asked */}
            {!editable ? (
              <div>
                <h3>Requested change</h3>
                <ApprovalDetails
                  values={reviewing.after}
                  categoryName={categories.find((c) => String(c._id) === String(reviewing.after.categoryId))?.name.en}
                  providerName={reviewingProvider}
                />
              </div>
            ) : reviewing.kind === "product" ? (
              <div>
                <h3>Photos and provider</h3>
                <ApprovalDetails
                  values={{ images: reviewing.after.images ?? [], ...(reviewing.after.providerId ? { providerId: reviewing.after.providerId } : {}) }}
                  providerName={reviewingProvider}
                />
              </div>
            ) : null}
          </div>
          {reviewing.state === "pending" ? (
            <ActionForm
              // a fresh form for each request, so one request's values never show on another's
              key={String(reviewing._id)}
              action={governanceAction}
              submit="Record decision"
              confirmMessage={
                isDelete(reviewing.kind)
                  ? "Approving deletes it: its stock is written off and it leaves the shop, the Stock page and baskets. Past orders and bills keep it. Rejecting sends it back to the person who asked."
                  : editable
                    ? "Approving publishes it with the details in this form, at the time you chose or straight away; rejecting sends it back to the person who asked, as they asked it."
                    : "Approving publishes the change at the time you chose, or straight away; rejecting sends it back to the person who asked."
              }
            >
              <input type="hidden" name="operation" value="review" />
              <input type="hidden" name="requestId" value={String(reviewing._id)} />
              {editable && (
                <>
                  <input type="hidden" name="edit" value="1" />
                  <p className="muted">
                    Filled in with what {nameOf(reviewing.requesterId)} asked for. Change anything before you approve; a rejection leaves it as
                    they asked.
                  </p>
                  {reviewing.kind === "product" && (
                    <>
                      <ProductDetailsFields values={reviewing.after} shelves={shelves} />
                      <fieldset className="form-section">
                        <legend>Pack</legend>
                        <div className="staff-form-grid">
                          <PackFields values={reviewing.after} owner={owner} />
                        </div>
                      </fieldset>
                      <AudienceAndTaxFields values={reviewing.after} />
                    </>
                  )}
                  {reviewing.kind === "variant" && (
                    <fieldset className="form-section">
                      <legend>Pack</legend>
                      <div className="staff-form-grid">
                        <PackFields values={reviewing.after} owner={owner} orderLimit={Number(reviewing.after.maxQuantity)} />
                      </div>
                    </fieldset>
                  )}
                  {reviewing.kind === "price" && (
                    <div className="staff-form-grid">
                      <label>
                        Selling price (₹)
                        <MoneyInput name="priceRupees" defaultValue={Number(reviewing.after.pricePaise) / 100} />
                      </label>
                      <label>
                        MRP (₹)
                        <MoneyInput name="mrpRupees" defaultValue={Number(reviewing.after.mrpPaise) / 100} />
                      </label>
                    </div>
                  )}
                  {reviewing.kind === "stock" && (
                    <label>
                      Stock change <small>12 to add, -3 to take off</small>
                      <input name="delta" pattern="-?[0-9]+" defaultValue={String(reviewing.after.delta)} required />
                    </label>
                  )}
                </>
              )}
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
              {!isDelete(reviewing.kind) && (
                <label>
                  Publish at <small>Optional; leave empty to publish as soon as you approve</small>
                  <input name="scheduledAt" type="datetime-local" />
                </label>
              )}
            </ActionForm>
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
                    <strong>{stateOf(reviewing.kind, String(h.next))[0]}</strong> · {nameOf(h.actorId)} ·{" "}
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
              const [label, tone] = stateOf(request.kind, request.state);
              return <StatusPill tone={tone}>{label}</StatusPill>;
            },
          },
        ]}
        empty={
          <EmptyState
            icon={ClipboardCheck}
            title={view === "waiting" ? "Nothing waiting" : "Nothing here"}
            body="New products, new packs, price changes, stock changes, deletes and providers' tax details appear here when someone asks for them."
            heading="h3"
          />
        }
      />
    </section>
  );
}
