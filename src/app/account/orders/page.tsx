import Link from "next/link";
import { Receipt } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { displayStatus, formatPrice} from "@/lib/display";
export const metadata = { title: "Your orders", robots: { index: false } };
export default async function Orders() {
  const user = await requirePage("order:own");
  const orders = await Order.find({ customerId: user.id })
    .sort({ createdAt: -1 })
    .limit(100);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div><span className="eyebrow">PURCHASE HISTORY</span><h1>Your orders</h1><p>Track deliveries, download invoices, reorder or ask for help.</p></div>
        <Link className="secondary-button" href="/account">Back to account</Link>
      </div>
      {orders.length ? (
        orders.map((o) => (
          <Link
            className="panel order-row"
            key={String(o._id)}
            href={`/account/orders/${o._id}`}
          >
            <strong>{o.number}</strong>
            <span>
              {displayStatus(o.orderStatus)} · {displayStatus(o.deliveryStatus)}
            </span>
            <span>{o.deliveryDate}</span>
            <strong>{formatPrice(o.totalPaise)} →</strong>
          </Link>
        ))
      ) : (
        <div className="panel empty-state">
          <Receipt size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <h2>No orders yet</h2>
          <p>Your purchases and delivery updates will appear here.</p>
          <Link className="primary-button" href="/catalog">Browse the store</Link>
        </div>
      )}
    </section>
  );
}
