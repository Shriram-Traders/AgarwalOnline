import { ApprovalDetails } from "@/components/approval-details";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { Category, Product, ProductVariant } from "@/lib/db/models";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { ApprovalRequest, ApprovalHistory } from "@/lib/governance/models";
import { ActionForm } from "@/components/action-form";
import { governanceAction } from "@/lib/governance/actions";
export const metadata = { title: "Approvals", robots: { index: false } };
export default async function Approvals() {
  const user = await requirePage("approval:review");
  const categories = await Category.find({}).select("name");
  const requests = await ApprovalRequest.find({})
    .sort({ createdAt: -1 })
    .limit(100);
  const history = await ApprovalHistory.find({
    requestId: { $in: requests.map((r) => r._id) },
  }).sort({ at: 1 });
  // price and stock requests point at a pack; name the product so the reviewer knows what is changing
  const packs = await ProductVariant.find({
    _id: { $in: requests.filter((r) => r.kind !== "product").map((r) => r.targetId) },
  }).select("productId label");
  const products = await Product.find({ _id: { $in: packs.map((pack) => pack.productId) } }).select("name");
  const titleFor = (r: { kind: string; targetId: unknown; after: Record<string, string> }) => {
    if (r.kind === "product") return `New product: ${r.after.nameEn}`;
    const pack = packs.find((item) => String(item._id) === String(r.targetId));
    const product = products.find((item) => String(item._id) === String(pack?.productId));
    return `${r.kind === "price" ? "Price change" : "Stock change"}: ${product?.name.en ?? "a product"}${pack ? ` · ${pack.label}` : ""}`;
  };
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Approvals"
        lead="New products, price changes and large stock changes wait here until another owner approves them."
        aside={<span className="live-chip">{requests.filter((r) => r.state === "pending").length} waiting</span>}
      />
      {requests.length ? (
        requests.map((r) => (
          <article className="panel" key={String(r._id)}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  Asked <When at={r.createdAt} />
                </span>
                <h2>{titleFor(r)}</h2>
              </div>
              <StatusPill value={r.state} />
            </div>
            <div className="approval-values">
              <div>
                <h3>Before</h3>
                <ApprovalDetails values={r.before} />
              </div>
              <div>
                <h3>Requested change</h3>
                <ApprovalDetails
                  values={r.after}
                  categoryName={
                    categories.find(
                      (c) => String(c._id) === String(r.after.categoryId),
                    )?.name.en
                  }
                />
              </div>
            </div>
            {r.state === "pending" && String(r.requesterId) !== user.id ? (
              <ActionForm
                action={governanceAction}
                submit="Record decision"
                confirmMessage="Approving publishes the change at the time you chose, or straight away; rejecting sends it back to the person who asked."
              >
                <input type="hidden" name="operation" value="review" />
                <input type="hidden" name="requestId" value={String(r._id)} />
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
            ) : r.state === "pending" ? (
              <p className="notice">
                You asked for this change, so another owner has to review it.
              </p>
            ) : null}
            <details style={{ marginTop: 16 }}>
              <summary>Approval history</summary>
              <ul>
                {history
                  .filter((h) => String(h.requestId) === String(r._id))
                  .map((h) => (
                    <li key={String(h._id)}>
                      {h.previous} → {h.next} ·{" "}
                      {new Date(h.at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      {h.comment}
                    </li>
                  ))}
              </ul>
            </details>
          </article>
        ))
      ) : (
        <EmptyState icon={ClipboardCheck} title="Nothing waiting" body="New products, price changes and large stock changes wait here for another owner." />
      )}
    </section>
  );
}
