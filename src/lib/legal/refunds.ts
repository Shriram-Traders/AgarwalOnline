import type { LegalBuilder } from "./types";

/* Refunds & Cancellations: the cancel window, returns flow and refund routes the code actually runs. */
export const refundsDoc: LegalBuilder = {
  en: (f) => ({
    title: "Refunds & Cancellations",
    lead: "When you can cancel, how to report a problem with an order, and how money comes back to you.",
    sections: [
      {
        id: "cancel-by-you",
        title: "Cancelling an order yourself",
        blocks: [
          "Cancel from your order page until the store confirms the order. We don't charge anything for cancelling.",
        ],
      },
      {
        id: "cancel-by-store",
        title: "When the store cancels",
        blocks: [
          "The store may cancel an order, or part of it, if an item is out of stock or wrongly priced, delivery isn't possible, or the order looks like misuse. We tell you the reason on your order page, and refund in full anything you paid for the cancelled items.",
        ],
      },
      {
        id: "failed-delivery",
        title: "If delivery doesn't happen",
        blocks: [
          "If no one can receive the order, we try again or bring it back to the shop. If it can't be delivered, the order is cancelled and nothing is due.",
        ],
      },
      {
        id: "problems",
        title: "Missing, damaged or wrong items",
        blocks: [
          "After delivery, report the problem from [Complaints & returns](/account/complaints) as soon as you can, and add photos if you can. Keep the item and its packaging as they arrived. The store reviews every request and will offer a replacement, a return, a refund, or explain why the request is declined.",
        ],
      },
      {
        id: "returns",
        title: "Returns",
        blocks: [
          "Ask for a return in the same complaint. We usually accept returns of items that arrived missing, damaged, faulty or wrong; other returns are at the store's discretion. If a return is approved, we arrange a pickup and show the date on your complaint. Returned items should be unused and in the condition they were delivered in, unless they arrived damaged or faulty.",
        ],
      },
      {
        id: "refunds",
        title: "How refunds are paid",
        blocks: [
          {
            rows: [
              ["Money you paid", f.upiAtDoor ? "In cash, by UPI or by bank transfer. The reference is noted on your order." : "In cash or by bank transfer. The reference is noted on your order."],
              ["Items not packed", "Taken off your bill, so you never pay for them."],
            ],
          },
          "A refund is started once a cancellation is confirmed, or once a returned item has reached the store and been checked.",
        ],
      },
      {
        id: "decision",
        title: "The store's decision",
        blocks: [
          `${f.business.legalName} reviews every cancellation, return and refund request, and its decision is final within the store's own process, as set out in [Terms & Conditions](/p/terms-and-conditions#disputes). This doesn't affect your rights under consumer law.`,
        ],
      },
    ],
  }),
};
