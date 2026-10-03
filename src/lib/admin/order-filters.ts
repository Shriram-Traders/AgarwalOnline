/** The order list's filters: what the counter asks "what's waiting at this step?" */
export const FILTERS = {
  "to-confirm": { label: "To confirm", match: { orderStatus: "placed" } },
  packing: {
    label: "Packing",
    match: { orderStatus: { $ne: "cancelled" }, fulfilmentStatus: { $in: ["picking", "packed"] } },
  },
  // an order the store cancelled after packing stays "ready" with no rider; it isn't waiting for one
  ready: {
    label: "Ready, no rider",
    match: { orderStatus: "confirmed", fulfilmentStatus: "ready", deliveryStatus: "unassigned" },
  },
  "on-the-way": {
    label: "On the way",
    match: { deliveryStatus: { $in: ["assigned", "out-for-delivery"] } },
  },
  // a missed attempt or a failed delivery holds its stock until someone chooses Try again or
  // Returned to shop on the order; before this it matched no filter and read as plain "Confirmed"
  "not-delivered": {
    label: "Delivery didn’t go through",
    match: { orderStatus: "confirmed", deliveryStatus: { $in: ["attempted", "failed"] } },
  },
  delivered: { label: "Delivered", match: { deliveryStatus: "delivered" } },
  cancelled: { label: "Cancelled", match: { orderStatus: "cancelled" } },
  // paid online, with items that weren't packed: the customer was promised that part back, and
  // only the owner can refund it (a refund made on the Refunds page moves the order off "paid")
  "refund-owed": {
    label: "Refund owed",
    match: { orderStatus: { $ne: "cancelled" }, paymentStatus: "paid", shortfallPaise: { $gt: 0 } },
  },
} as const;
export type OrderFilter = keyof typeof FILTERS;
/** Filters for the owner's own work: only they can act on these orders. */
export const OWNER_FILTERS: readonly OrderFilter[] = ["refund-owed"];
