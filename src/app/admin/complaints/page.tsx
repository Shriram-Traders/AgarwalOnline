import { returnTransitions, aftercareLabel } from "@/lib/aftercare/transitions";
import { MessageSquareWarning } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { Complaint, ReturnRequest } from "@/lib/aftercare/models";
import { ActionForm } from "@/components/action-form";
import { aftercareAction } from "@/lib/aftercare/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
export const metadata = { title: "Complaints & returns", robots: { index: false } };
export default async function Complaints() {
  const user = await requirePage("complaint:manage");
  const complaints = await Complaint.find({})
    .sort({ createdAt: -1 })
    .limit(100);
  const returns = await ReturnRequest.find({
    complaintId: { $in: complaints.map((c) => c._id) },
  });
  const evidence = await UploadedEvidence.find({
    complaintId: { $in: complaints.map((complaint) => complaint._id) },
  }).sort({ createdAt: -1 });
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Aftercare"
        title="Complaints & returns"
        lead="Open issues, return requests and the store's response."
      />
      {complaints.map((c) => {
        const r = returns.find((r) => String(r.complaintId) === String(c._id));
        return (
          <article className="panel" key={String(c._id)}>
            <div className="order-row">
              <h2>{aftercareLabel(c.type)}</h2>
              <span className="status-pill">{aftercareLabel(c.status)}</span>
            </div>
            <p>{c.description}</p>
            <div className="evidence-strip">
              {evidence
                .filter((item) => String(item.complaintId) === String(c._id))
                .map((item) => (
                  <a
                    key={String(item._id)}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Customer photo
                  </a>
                ))}
            </div>
            <Link href={`/admin/orders/${c.orderId}`}>
              View order details →
            </Link>
            {user.roles.includes("super-admin") && (
              <Link
                className="secondary-button"
                href={`/super-admin/refunds?order=${c.orderId}`}
              >
                Arrange refund
              </Link>
            )}
            <div className="basket-layout">
              <div>
                {["open", "reviewing"].includes(c.status) ? (
                  <ActionForm
                    action={aftercareAction}
                    submit="Update complaint"
                  >
                    <input type="hidden" name="operation" value="resolve" />
                    <input
                      type="hidden"
                      name="complaintId"
                      value={String(c._id)}
                    />
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
                      <textarea
                        name="resolution"
                        minLength={5}
                        maxLength={2000}
                        required
                      />
                    </label>
                  </ActionForm>
                ) : (
                  <p>{c.resolution}</p>
                )}
              </div>
              {r && (
                <div>
                  <h3>Return: {aftercareLabel(r.status)}</h3>
                  {r.notes && <p>{r.notes}</p>}
                  {(returnTransitions[r.status]?.length ?? 0) > 0 && (
                    <ActionForm action={aftercareAction} submit="Update return">
                      <input type="hidden" name="operation" value="return" />
                      <input
                        type="hidden"
                        name="returnId"
                        value={String(r._id)}
                      />
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
                        <textarea
                          name="notes"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </ActionForm>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
      {!complaints.length && (
        <EmptyState icon={MessageSquareWarning} title="Nothing to resolve" body="Complaints and return requests land here." />
      )}
    </section>
  );
}
