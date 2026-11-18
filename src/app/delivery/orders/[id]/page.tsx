import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { dayLabel } from "@/lib/commerce/slots";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { objectId } from "@/lib/commerce/service";
import { ActionForm } from "@/components/action-form";
import { PolicyNotice } from "@/components/policy-notice";
import { operationAction } from "@/lib/operations/actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
import { DeliveryAttempt } from "@/lib/operations/models";
import { PhotoInput } from "@/components/photo-input";
import { When } from "@/components/when";
import { formatPrice, noBreakTimes } from "@/lib/display";
import { inBagOf, lineNotes, type PackedLine } from "@/lib/operations/packing";
import { taxProfile } from "@/lib/tax/profile";
export const metadata = { title: "Delivery", robots: { index: false } };

/** A photo that backs up what happened at the door: optional, so it never stands in the way of the main step. */
function PhotoForm({ id, purpose, label }: { id: string; purpose: "delivery" | "failed-delivery"; label: string }) {
  return (
    <ActionForm action={evidenceAction} submit="Upload photo" buttonClassName="secondary-button">
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="orderId" value={id} />
      <label>
        {label}
        <PhotoInput />
      </label>
    </ActionForm>
  );
}

export default async function DeliveryOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage("delivery:assigned");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const o = await Order.findOne({
    _id: id,
    assignedTo: user.id,
    orderStatus: "confirmed",
    deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] },
  });
  if (!o) notFound();
  const [evidence, lastAttempt, shop] = await Promise.all([
    UploadedEvidence.find({ orderId: o._id }).sort({ createdAt: -1 }),
    o.deliveryStatus === "attempted" ? DeliveryAttempt.findOne({ orderId: o._id }).sort({ at: -1 }) : null,
    taxProfile(),
  ]);
  const cod = o.paymentMethod === "cod";
  const phone: string | undefined = o.address.phone || undefined;
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/delivery">My deliveries</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{o.number}</span>
      </nav>
      <PageHeading eyebrow="Assigned to you" title={o.number} />
      <div className="basket-layout">
        <div className="panel">
          <h2>{o.address.name}</h2>
          <p>
            {o.address.line}
            <br />
            {[o.address.areaName, o.address.pin].filter(Boolean).join(" · ")}
          </p>
          {o.address.instructions && (
            <p className="notice">
              <strong>Note from the customer:</strong> {o.address.instructions}
            </p>
          )}
          <div className="delivery-links">
            {phone && (
              <a className="secondary-button" href={`tel:+91${phone}`}>
                Call customer
              </a>
            )}
            <a
              className="secondary-button"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [o.address.line, o.address.areaName, o.address.pin].filter(Boolean).join(" "),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open navigation
            </a>
            {shop.phone && (
              <a className="secondary-button" href={`tel:+91${shop.phone}`}>
                Call the shop
              </a>
            )}
          </div>
          {!phone && <p className="muted">There is no phone number on this order.</p>}
          <PolicyNotice kind="rider" />
          <p style={{ marginTop: 20 }}>
            {o.deliveryDate ? dayLabel(o.deliveryDate) : ""} · {noBreakTimes(o.deliveryWindow)}
          </p>
          {/* so the rider can answer "is everything there?" before asking for the code */}
          <h3>In the parcel</h3>
          <ul className="parcel-list">
            {o.items.map((i: PackedLine & { variantId: string }) => (
              <li key={String(i.variantId)}>
                {inBagOf(i) ? `${inBagOf(i)} × ` : ""}
                {i.name} · {i.label}
                {lineNotes(i, cod).map((note) => (
                  <small className="line-note" key={note}>
                    {note}
                  </small>
                ))}
              </li>
            ))}
          </ul>
          <h2>{cod ? `Collect ${formatPrice(o.totalPaise)}` : "Already paid"}</h2>
          {cod && o.originalTotalPaise != null && (
            <p className="muted">
              The bill changed after packing (it was{" "}
              {formatPrice(o.originalTotalPaise)}): items that weren’t available
              aren’t charged.
            </p>
          )}
          {o.deliveryStatus === "assigned" ? (
            <ActionForm action={operationAction} submit="Start delivery">
              <input type="hidden" name="orderId" value={id} />
              <input type="hidden" name="operation" value="delivery-status" />
              <input type="hidden" name="next" value="out-for-delivery" />
            </ActionForm>
          ) : o.deliveryStatus === "out-for-delivery" ? (
            <div className="form-stack">
              {/* Start delivery's own message goes with its button, so the step says it here */}
              <p className="muted">
                You’re on the way: the customer has been told. Their delivery code is on their order page
                {phone && `, and goes by WhatsApp (or SMS) to the phone ending ${phone.slice(-4)} as you start`}.
              </p>
              {phone && (
                <ActionForm action={operationAction} submit="Resend the code" buttonClassName="secondary-button">
                  <input type="hidden" name="orderId" value={id} />
                  <input type="hidden" name="operation" value="send-delivery-code" />
                </ActionForm>
              )}
              <ActionForm action={operationAction} submit="Verify code & mark delivered">
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="deliver" />
                {/* nothing to type for the cash: the rider confirms the amount below */}
                <input type="hidden" name="cashRupees" value={cod ? (o.totalPaise / 100).toFixed(2) : "0"} />
                <label>
                  Customer delivery code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                <label>
                  <input type="checkbox" required />
                  {cod
                    ? `I handed over the complete order and collected ${formatPrice(o.totalPaise)} in cash.`
                    : "I handed over the complete order."}
                </label>
              </ActionForm>
              <p className="muted">
                The customer can’t give you the code (no phone, no internet)? Call the shop: the owner can confirm the
                delivery.
              </p>
              <PhotoForm id={id} purpose="delivery" label="Photo of the delivery (optional)" />
            </div>
          ) : (
            <div className="form-stack">
              {lastAttempt && (
                <p className="notice">
                  Missed <When at={lastAttempt.at} />: {lastAttempt.reason}
                </p>
              )}
              <div className="split-actions">
                <ActionForm action={operationAction} submit="Retry delivery">
                  <input type="hidden" name="orderId" value={id} />
                  <input type="hidden" name="operation" value="delivery-status" />
                  <input type="hidden" name="next" value="out-for-delivery" />
                </ActionForm>
                <ActionForm
                  action={operationAction}
                  submit="Close as failed"
                  buttonClassName="secondary-button"
                  confirmMessage="The stop leaves your list, and the customer and the shop are told the reason. This can’t be undone."
                >
                  <input type="hidden" name="orderId" value={id} />
                  <input type="hidden" name="operation" value="delivery-status" />
                  <input type="hidden" name="next" value="failed" />
                  <label>
                    Why it can’t be delivered
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={500}
                      required
                    />
                  </label>
                </ActionForm>
              </div>
            </div>
          )}
          {evidence.length > 0 && (
            <div className="evidence-strip">
              {evidence.map((item, n) => (
                <a key={String(item._id)} href={item.url} target="_blank" rel="noreferrer">
                  View photo {evidence.length - n}
                </a>
              ))}
            </div>
          )}
        </div>
        {o.deliveryStatus === "out-for-delivery" && (
          <div className="panel">
            <h2>Unable to deliver?</h2>
            <div className="form-stack">
              <ActionForm action={operationAction} submit="Record delivery attempt">
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="delivery-status" />
                <input type="hidden" name="next" value="attempted" />
                <label>
                  Reason
                  <textarea
                    name="reason"
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </label>
              </ActionForm>
              <PhotoForm id={id} purpose="failed-delivery" label="Photo of the door or parcel (optional)" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
