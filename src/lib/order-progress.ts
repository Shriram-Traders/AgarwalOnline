/*
 * The customer's view of how an order is going: a four-step tracker like quick-commerce apps
 * (Placed → Packed → On the way → Delivered) and a history in plain words. The order page used
 * to print the raw timeline ("order: placed", "fulfilment: picking").
 */

type TimelineEvent = {
  dimension?: string | null;
  next?: string | null;
  notes?: string | null;
  actorId?: unknown;
  at: Date | string;
};
type ProgressFields = { orderStatus: string; fulfilmentStatus?: string; deliveryStatus?: string };

export type TrackerStep = {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
  /** When the step was reached, for steps that are done. */
  at?: Date;
};

const reachedBy =
  (dimension: string, ...next: string[]) =>
  (event: TimelineEvent) =>
    event.dimension === dimension && next.includes(String(event.next));

const STEPS = [
  { key: "placed", label: "Order placed", reached: reachedBy("order", "placed") },
  { key: "packed", label: "Packed", reached: reachedBy("fulfilment", "packed", "ready") },
  { key: "on-the-way", label: "On the way", reached: reachedBy("delivery", "out-for-delivery") },
  { key: "delivered", label: "Delivered", reached: reachedBy("delivery", "delivered") },
];

/** How many of the four steps are behind the order, going by its status fields. */
function stepsDone(order: ProgressFields) {
  const delivery = order.deliveryStatus ?? "unassigned";
  const fulfilment = order.fulfilmentStatus ?? "unassigned";
  if (delivery === "delivered" || order.orderStatus === "completed") return 4;
  if (delivery === "out-for-delivery" || delivery === "attempted") return 3;
  // a rider is only given an order that is packed, so the top line and the tracker agree
  if (fulfilment === "packed" || fulfilment === "ready" || delivery === "assigned") return 2;
  return 1;
}

/**
 * The tracker's steps, each done one with the time it happened. Null for an order that was
 * cancelled or came back to the shop: there is no road left to show.
 */
export function orderTracker(
  order: ProgressFields,
  events: TimelineEvent[],
  placedAt?: Date,
): TrackerStep[] | null {
  if (order.orderStatus === "cancelled" || order.deliveryStatus === "returned") return null;
  const done = stepsDone(order);
  return STEPS.map((step, index) => {
    // the latest time: a delivery tried again is "on the way" from its second start
    const event = events.filter(step.reached).at(-1);
    const at = event ? new Date(event.at) : index === 0 ? placedAt : undefined;
    return {
      key: step.key,
      label: step.label,
      state: index < done ? "done" : index === done ? "current" : "todo",
      at: index < done ? at : undefined,
    };
  });
}

/** Timeline codes in the customer's words. Steps that are the shop's own business are left out. */
const EVENT_WORDS: Record<string, string> = {
  "order:placed": "Order placed",
  "order:confirmed": "Confirmed by the shop",
  "order:cancelled": "Order cancelled",
  "order:completed": "Order completed",
  "fulfilment:picking": "Packing started",
  "fulfilment:packed": "Packed",
  "fulfilment:ready": "Ready for delivery",
  "delivery:assigned": "Delivery partner assigned",
  "delivery:out-for-delivery": "Out for delivery",
  "delivery:attempted": "Delivery attempted",
  "delivery:failed": "Delivery didn’t go through",
  "delivery:delivered": "Delivered",
  "delivery:returned": "Returned to the shop",
  "payment:paid": "Payment received",
  "payment:failed": "Online payment didn’t go through",
  "payment:partially-refunded": "Part of the payment refunded",
  "payment:refunded": "Payment refunded",
};

export type HistoryEntry = { label: string; at: Date; note?: string };

/**
 * The order's history in plain words, newest first. Only a cancellation's note is shown: the
 * store types it as the reason the customer sees; other notes are for staff.
 */
export function orderHistory(events: TimelineEvent[]): HistoryEntry[] {
  return events
    .flatMap((event) => {
      const label = EVENT_WORDS[`${event.dimension}:${event.next}`];
      if (!label) return [];
      const note =
        event.dimension === "order" && event.next === "cancelled" && event.notes ? event.notes : undefined;
      return [{ label, at: new Date(event.at), note }];
    })
    .reverse();
}

/** The cancellation, and whether the customer made it, for the top of a cancelled order. */
export function cancellation(events: TimelineEvent[], customerId: unknown) {
  const event = events.filter(reachedBy("order", "cancelled")).at(-1);
  if (!event) return null;
  return {
    at: new Date(event.at),
    byCustomer: String(event.actorId) === String(customerId),
    reason: event.notes ?? undefined,
  };
}
