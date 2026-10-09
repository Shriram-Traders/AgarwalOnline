import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { Refund } from "@/lib/payments/models";
import { ActionForm } from "@/components/action-form";
import { refundAction } from "@/lib/payments/refund-actions";
import { displayStatus, formatPrice, methodLabel } from "@/lib/display";
import { MoneyInput } from "@/components/money-input";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Refunds", robots: { index: false } };

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  await requirePage("refund:write");
  const selectedOrder = (await searchParams).order ?? "";
  const [orders, refunds] = await Promise.all([
    Order.find({ paymentStatus: { $in: ["paid", "partially-refunded"] } })
      .sort({ createdAt: -1 })
      .limit(200)
      .select("number totalPaise paymentMethod paymentStatus"),
    Refund.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("orderId", "number"),
  ]);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Refunds"
        lead="Give money back for a paid order, in full or in part, and follow it until it reaches the customer."
        aside={
          <span className="live-chip">
            {refunds.filter((item) => item.status !== "processed").length} in progress
          </span>
        }
      />
      <details className="panel create-staff">
        <summary>Start a refund</summary>
        <ActionForm action={refundAction} submit="Create refund request">
          <input type="hidden" name="operation" value="create" />
          <div className="staff-form-grid">
            <label>
              Paid order
              <select name="orderId" defaultValue={selectedOrder} required>
                <option value="">Choose an order</option>
                {orders.map((order) => (
                  <option key={String(order._id)} value={String(order._id)}>
                    {order.number} · {formatPrice(order.totalPaise)} ·{" "}
                    {methodLabel(order.paymentMethod)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (₹)
              <MoneyInput name="amountRupees" />
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={5} maxLength={500} required />
            </label>
          </div>
        </ActionForm>
      </details>
      <div className="refund-list">
        {refunds.map((refund) => {
          const order = refund.orderId as unknown as {
            _id: unknown;
            number: string;
          };
          return (
            <article className="panel refund-row" key={String(refund._id)}>
              <div>
                <span className="status-pill">{displayStatus(refund.status)}</span>
                <h2>{formatPrice(refund.amountPaise)}</h2>
                <p>{refund.reason}</p>
                <small>
                  {order?.number} · {refund.mode}
                </small>
              </div>
              {!["processed", "processing"].includes(refund.status) && (
                <ActionForm
                  action={refundAction}
                  confirmMessage={
                    refund.mode === "manual"
                      ? "This marks the refund as paid to the customer. It cannot be undone."
                      : refund.mode === "tab"
                        ? "This takes the amount off what the family owes on its tab. It cannot be undone."
                        : "This sends the refund to Razorpay, which pays the customer. It cannot be undone."
                  }
                  submit={
                    refund.mode === "manual"
                      ? "Mark refund paid"
                      : refund.mode === "tab"
                        ? "Credit the family tab"
                        : "Send to Razorpay"
                  }
                >
                  <input type="hidden" name="operation" value="process" />
                  <input
                    type="hidden"
                    name="refundId"
                    value={String(refund._id)}
                  />
                  {refund.mode === "manual" && (
                    <label>
                      Cash/bank reference
                      <input
                        name="externalReference"
                        minLength={3}
                        maxLength={120}
                        required
                      />
                    </label>
                  )}
                </ActionForm>
              )}
              <Link href={`/admin/orders/${order?._id}`}>View order →</Link>
            </article>
          );
        })}
        {!refunds.length && (
          <div className="panel empty-state">
            <h2>No refunds yet</h2>
            <p>Refund requests and their status will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
