import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { objectId } from "@/lib/commerce/service";
import { ActionForm } from "@/components/action-form";
import { operationAction } from "@/lib/operations/actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
import { MoneyInput } from "@/components/money-input";
import { PhotoInput } from "@/components/photo-input";
import { formatPrice } from "@/lib/display";
import { inBagOf, lineNotes, type PackedLine } from "@/lib/operations/packing";
export const metadata = { title: "Delivery", robots: { index: false } };
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
  const evidence = await UploadedEvidence.find({ orderId: o._id }).sort({
    createdAt: -1,
  });
  return (
    <section className="page-container">
      <PageHeading eyebrow="Assigned to you" title={o.number} />
      <div className="basket-layout">
        <div className="panel">
          <h2>{o.address.name}</h2>
          <p>
            {o.address.line}
            <br />
            {o.address.areaName} · {o.address.pin}
          </p>
          <p>{o.address.instructions}</p>
          <div className="delivery-links">
            <a className="secondary-button" href={`tel:+91${o.address.phone}`}>
              Call customer
            </a>
            <a
              className="secondary-button"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address.line} ${o.address.areaName} ${o.address.pin}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open navigation
            </a>
          </div>
          <p style={{ marginTop: 20 }}>
            {o.deliveryDate} · {o.deliveryWindow}
          </p>
          {/* so the rider can answer "is everything there?" before asking for the code */}
          <h3>In the parcel</h3>
          <ul className="parcel-list">
            {o.items.map((i: PackedLine & { variantId: string }) => (
              <li key={String(i.variantId)}>
                {inBagOf(i) ? `${inBagOf(i)} × ` : ""}
                {i.name} · {i.label}
                {lineNotes(i, o.paymentMethod === "cod").map((note) => (
                  <small className="line-note" key={note}>
                    {note}
                  </small>
                ))}
              </li>
            ))}
          </ul>
          <h2>
            {o.paymentMethod === "cod"
              ? `Collect ₹${o.totalPaise / 100}`
              : "Prepaid order"}
          </h2>
          {o.paymentMethod === "cod" && o.originalTotalPaise != null && (
            <p className="muted">
              The bill changed after packing (it was{" "}
              {formatPrice(o.originalTotalPaise)}): items that weren’t available
              aren’t charged.
            </p>
          )}
          <ActionForm action={evidenceAction} submit="Upload delivery photo">
            <input type="hidden" name="purpose" value="delivery" />
            <input type="hidden" name="orderId" value={id} />
            <label>
              Proof photograph
              <PhotoInput />
            </label>
          </ActionForm>
          <div className="evidence-strip">
            {evidence.map((item) => (
              <a
                key={String(item._id)}
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                View uploaded photo
              </a>
            ))}
          </div>
          {o.deliveryStatus === "assigned" ? (
            <ActionForm action={operationAction} submit="Start delivery">
              <input type="hidden" name="orderId" value={id} />
              <input type="hidden" name="operation" value="delivery-status" />
              <input type="hidden" name="next" value="out-for-delivery" />
            </ActionForm>
          ) : o.deliveryStatus === "out-for-delivery" ? (
            <ActionForm
              action={operationAction}
              submit="Verify code & mark delivered"
            >
              <input type="hidden" name="orderId" value={id} />
              <input type="hidden" name="operation" value="deliver" />
              <label>
                Customer delivery code
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <p className="muted">
                Ask the customer to request a delivery code from their order
                page after receiving the items.
              </p>
              <label>
                Cash collected (₹)
                <MoneyInput name="cashRupees" defaultValue={o.paymentMethod === "cod" ? o.totalPaise / 100 : 0} />
              </label>
              <label>
                <input type="checkbox" required />I have handed over the
                complete order.
              </label>
            </ActionForm>
          ) : (
            <div className="split-actions">
              <ActionForm action={operationAction} submit="Retry delivery">
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="delivery-status" />
                <input type="hidden" name="next" value="out-for-delivery" />
              </ActionForm>
              <ActionForm action={operationAction} submit="Close as failed" confirmMessage="Close this delivery as failed only after recording the final reason and required evidence.">
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="delivery-status" />
                <input type="hidden" name="next" value="failed" />
                <label>
                  Final reason
                  <textarea
                    name="reason"
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </label>
              </ActionForm>
            </div>
          )}
        </div>
        {o.deliveryStatus === "out-for-delivery" && (
          <div className="panel">
            <h2>Unable to deliver?</h2>
            <ActionForm
              action={operationAction}
              submit="Record delivery attempt"
            >
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
            <ActionForm
              action={evidenceAction}
              submit="Upload failed-delivery photo"
            >
              <input type="hidden" name="purpose" value="failed-delivery" />
              <input type="hidden" name="orderId" value={id} />
              <label>
                Evidence photograph
                <PhotoInput />
              </label>
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
