import { conversationAction } from "@/lib/chat/actions";
import { PageHeading } from "@/components/page-heading";
import { operationAction } from "@/lib/operations/actions";
import { PayButton } from "@/components/pay-button";
import { Payment } from "@/lib/payments/models";
import { Refund } from "@/lib/payments/models";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { Order, OrderTimelineEvent } from "@/lib/commerce/models";
import { objectId } from "@/lib/commerce/service";
import { cancelAction, reorderAction } from "@/lib/commerce/actions";
import { ActionForm } from "@/components/action-form";
import { displayStatus, formatPrice} from "@/lib/display";
export const metadata = { title: "Order details", robots: { index: false } };
export default async function OrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage("order:own");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const o = await Order.findOne({ _id: id, customerId: user.id });
  if (!o) notFound();
  const payment =
    o.paymentMethod === "razorpay"
      ? await Payment.findOne({ orderId: o._id })
      : null;
  const refunds = await Refund.find({ orderId: o._id }).sort({ createdAt: -1 });
  const events = await OrderTimelineEvent.find({ orderId: id }).sort({ at: 1 });
  return (
    <section className="page-container">
      <PageHeading eyebrow="Your order" title={o.number} />
      <div className="status-strip">
        <span>Order: {displayStatus(o.orderStatus)}</span>
        <span>Payment: {displayStatus(o.paymentStatus)}</span>
        <span>Packing: {displayStatus(o.fulfilmentStatus)}</span>
        <span>Delivery: {displayStatus(o.deliveryStatus)}</span>
      </div>
      <div className="basket-layout">
        <div className="panel">
          <h2>Your items</h2>
          {o.items.map(
            (i: {
              variantId: string;
              name: string;
              label: string;
              quantity: number;
              linePaise: number;
            }) => (
              <p className="order-row" key={String(i.variantId)}>
                <span>
                  {i.quantity} × {i.name} · {i.label}
                </span>
                <strong>{formatPrice(i.linePaise)}</strong>
              </p>
            ),
          )}
          <hr />
          <p>Delivery: {formatPrice(o.deliveryPaise)}</p>
          <h3>Total: {formatPrice(o.totalPaise)}</h3>
          <p>
            {o.paymentMethod === "cod"
              ? `Cash on Delivery · ${o.codStatus}`
              : `Razorpay · ${o.paymentStatus}`}
          </p>
          <div className="order-quick-actions">
            <ActionForm action={reorderAction} submit="Add these items again">
              <input type="hidden" name="orderId" value={id} />
            </ActionForm>
            <a className="secondary-button" href={`/api/invoices/${id}`}>
              Download invoice
            </a>
          </div>
          {payment?.refundNeeded && (
            <p className="notice">
              Payment was received after this order closed. The store has been
              notified to arrange your refund.
            </p>
          )}
          {refunds.length > 0 && (
            <div className="notice">
              <strong>Refunds</strong>
              {refunds.map((refund) => (
                <p key={String(refund._id)}>
                  {formatPrice(refund.amountPaise)} · {refund.status}
                </p>
              ))}
            </div>
          )}
          {o.paymentMethod === "razorpay" &&
            o.orderStatus === "placed" &&
            o.paymentStatus === "pending" &&
            o.expiresAt > new Date() && (
              <PayButton orderId={id} amount={o.totalPaise} />
            )}
          <ActionForm action={conversationAction} submit="Ask about this order">
            <input type="hidden" name="orderId" value={id} />
            <input type="hidden" name="title" value={`Help with ${o.number}`} />
          </ActionForm>
          <h2 style={{ marginTop: 24 }}>Order timeline</h2>
          <ol>
            {events.map((e) => (
              <li key={String(e._id)}>
                {e.dimension}: {e.next}{" "}
                <span className="muted">
                  {new Date(e.at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="panel">
            <h2>Delivering to</h2>
            {o.deliveryStatus === "out-for-delivery" && (
              <ActionForm
                action={operationAction}
                submit="Request delivery confirmation code"
              >
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="delivery-otp" />
                <p className="muted">
                  Share this code with the delivery partner only after receiving
                  your complete order.
                </p>
              </ActionForm>
            )}
            <p>
              {o.address.name}
              <br />
              {o.address.line}
              <br />
              {o.address.areaName} · {o.address.pin}
            </p>
            <strong>
              {o.deliveryDate} · {o.deliveryWindow}
            </strong>
            <p>{o.address.instructions}</p>
          </div>
          {o.orderStatus === "placed" && o.paymentMethod === "cod" && (
            <ActionForm action={cancelAction} submit="Cancel this order" confirmMessage="Cancel this order and release its reserved stock? This cannot be undone.">
              <input type="hidden" name="orderId" value={id} />
              <label>
                <input type="checkbox" required /> I want to cancel this order.
              </label>
            </ActionForm>
          )}
        </div>
      </div>
    </section>
  );
}
