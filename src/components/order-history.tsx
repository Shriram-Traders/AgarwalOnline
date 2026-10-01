import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { customerStage, formatIst, formatPrice, type OrderStatusFields } from "@/lib/display";
import { StatusPill } from "./status-pill";

export type HistoryOrder = OrderStatusFields & {
  _id: unknown;
  number: string;
  createdAt: Date;
  totalPaise: number;
  items: { quantity: number }[];
};

/**
 * A customer's orders, newest first: number, when it was placed, how many items, where it stands in
 * plain words and the total. Used on "Your orders" and, shortened, on the account page.
 */
export function OrderHistory({ orders, mr = false }: { orders: HistoryOrder[]; mr?: boolean }) {
  return (
    <ul className="order-history">
      {orders.map((order) => {
        const stage = customerStage(order, mr ? "mr" : "en");
        const items = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <li key={String(order._id)}>
            <Link href={`/account/orders/${order._id}`} className="panel order-history-row">
              <span className="order-history-main">
                <strong>{order.number}</strong>
                <small>
                  {formatIst(order.createdAt, { dateStyle: "medium" })} ·{" "}
                  {mr ? `${items} वस्तू` : `${items} item${items === 1 ? "" : "s"}`}
                </small>
              </span>
              <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
              <strong className="order-history-total">{formatPrice(order.totalPaise)}</strong>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
