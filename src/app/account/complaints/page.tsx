import { aftercareLabel } from "@/lib/aftercare/transitions";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { Complaint, ReturnRequest } from "@/lib/aftercare/models";
import { ActionForm } from "@/components/action-form";
import { aftercareAction } from "@/lib/aftercare/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
import { evidenceAction } from "@/lib/evidence/actions";
import { displayStatus } from "@/lib/display";
import { PhotoInput } from "@/components/photo-input";
export const metadata = { title: "Complaints & returns", robots: { index: false } };
const TYPES = ["missing-item", "damaged-item", "wrong-item", "other"];

export default async function Complaints({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; type?: string }>;
}) {
  const user = await requirePage("complaint:own");
  const params = await searchParams;
  const orders = await Order.find({ customerId: user.id })
    .select("number deliveryStatus")
    .sort({ createdAt: -1 })
    .limit(100);
  const complaints = await Complaint.find({ customerId: user.id })
    .sort({ createdAt: -1 })
    .limit(100);
  const returns = await ReturnRequest.find({ customerId: user.id });
  const evidence = await UploadedEvidence.find({
    ownerId: user.id,
    complaintId: { $in: complaints.map((complaint) => complaint._id) },
  }).sort({ createdAt: -1 });
  // a low rating's "Report a problem with an item" arrives with the order and the problem chosen
  const chosenOrder = orders.find((order) => String(order._id) === params.order);
  const chosenType = TYPES.includes(params.type ?? "") ? params.type : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Let’s make it right"
        title="Complaints & returns"
        lead="Tell us what went wrong and we’ll sort it."
      />
      <div className="basket-layout">
        <div>
          {complaints.map((c) => {
            const r = returns.find(
              (r) => String(r.complaintId) === String(c._id),
            );
            return (
              <article className="panel" key={String(c._id)}>
                <h2>{aftercareLabel(c.type)}</h2>
                <span className="status-pill">{aftercareLabel(c.status)}</span>
                <p style={{ marginTop: 15 }}>{c.description}</p>
                {c.resolution && (
                  <p>
                    <strong>Store response:</strong> {c.resolution}
                  </p>
                )}
                {r && (
                  <div className="notice">
                    Return: {aftercareLabel(r.status)}
                    {r.pickupDate ? ` · Pickup ${r.pickupDate}` : ""}
                    <p>{r.notes}</p>
                  </div>
                )}
                <div className="evidence-strip">
                  {evidence
                    .filter(
                      (item) => String(item.complaintId) === String(c._id),
                    )
                    .map((item) => (
                      <a
                        key={String(item._id)}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View photo
                      </a>
                    ))}
                </div>
                <ActionForm
                  action={evidenceAction}
                  submit="Upload evidence photo"
                >
                  <input type="hidden" name="purpose" value="complaint" />
                  <input
                    type="hidden"
                    name="complaintId"
                    value={String(c._id)}
                  />
                  <input
                    type="hidden"
                    name="orderId"
                    value={String(c.orderId)}
                  />
                  <label>
                    JPG, PNG or WebP · big phone photos are made smaller automatically
                    <PhotoInput />
                  </label>
                </ActionForm>
              </article>
            );
          })}
          {!complaints.length && (
            <EmptyState icon={ShieldCheck} title="Nothing reported" body="If an order arrives damaged or incomplete, tell us here." />
          )}
        </div>
        <div className="panel" id="report">
          <h2>Report an issue</h2>
          {orders.length ? (
            <ActionForm action={aftercareAction} submit="Send to the store">
              <input type="hidden" name="operation" value="create" />
              <label>
                Order
                <select name="orderId" required defaultValue={chosenOrder ? String(chosenOrder._id) : ""}>
                  <option value="">Choose your order</option>
                  {orders.map((o) => (
                    <option key={String(o._id)} value={String(o._id)}>
                      {o.number} · {displayStatus(o.deliveryStatus)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Issue
                <select name="type" defaultValue={chosenType ?? "missing-item"}>
                  <option value="missing-item">Missing item</option>
                  <option value="damaged-item">Damaged item</option>
                  <option value="wrong-item">Wrong item</option>
                  <option value="other">Other question</option>
                </select>
              </label>
              <label>
                Tell us what happened
                <textarea
                  name="description"
                  minLength={10}
                  maxLength={2000}
                  required
                />
              </label>
              <label>
                <input type="checkbox" name="requestReturn" />
                Request a return
              </label>
              <p className="muted">
                Item issues and returns can be reported after delivery. The
                store will review your request.
              </p>
            </ActionForm>
          ) : (
            <p>You can report an issue here once you place an order.</p>
          )}
        </div>
      </div>
    </section>
  );
}
