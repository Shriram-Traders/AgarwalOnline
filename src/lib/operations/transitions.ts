export const transitions = {
  order: {
    placed: ["confirmed", "cancelled"],
    // the store can still call an order off until it leaves the shop (see cancellable)
    confirmed: ["completed", "cancelled"],
    cancelled: [],
    completed: [],
  },
  fulfilment: {
    unassigned: ["picking"],
    picking: ["packed"],
    packed: ["ready"],
    ready: [],
  },
  delivery: {
    unassigned: ["assigned"],
    // back to "Packed, no rider" when staff take it off the rider or cancel the order
    assigned: ["out-for-delivery", "unassigned"],
    "out-for-delivery": ["delivered", "attempted"],
    // after a missed attempt: the rider retries or gives up, or staff hand it to another
    // rider, put it back for another try, or take the parcel back into the shop
    attempted: ["out-for-delivery", "failed", "assigned", "unassigned", "returned"],
    delivered: [],
    failed: ["unassigned", "returned"],
    returned: [],
  },
} as const;
export type Dimension = keyof typeof transitions;
export function assertTransition(
  dimension: Dimension,
  previous: string,
  next: string,
) {
  const map = transitions[dimension] as Record<string, readonly string[]>;
  if (!map[previous]?.includes(next))
    throw Error("This status change is not allowed.");
}

type OrderState = {
  orderStatus: string;
  deliveryStatus: string;
  paymentMethod: string;
  paymentStatus: string;
};
/*
 * Which store decisions an order allows right now. The staff order page shows only these, and
 * the service checks them again inside its transaction, so the two can't drift apart.
 */

/** The store can cancel an order until it leaves the shop with a rider. */
export const cancellable = (order: OrderState) =>
  ["placed", "confirmed"].includes(order.orderStatus) &&
  ["unassigned", "assigned"].includes(order.deliveryStatus);

/** A delivery that didn't go through waits for staff: try again, or take the parcel back. */
export const awaitingDecision = (order: OrderState) =>
  order.orderStatus === "confirmed" &&
  ["attempted", "failed"].includes(order.deliveryStatus);

/** The rider can be changed or removed before the delivery starts, or after a missed attempt. */
export const riderChangeable = (order: OrderState) =>
  order.orderStatus === "confirmed" &&
  ["assigned", "attempted"].includes(order.deliveryStatus);

/**
 * Money paid online that the shop still holds. It is only ever returned from the owner's
 * Refunds page, so the order page never closes such an order. Once the whole amount is refunded
 * there is nothing left to pay back, and the order can be closed here like any other.
 */
export const paidOnline = (order: OrderState) =>
  order.paymentMethod === "razorpay" &&
  ["paid", "partially-refunded"].includes(order.paymentStatus);
