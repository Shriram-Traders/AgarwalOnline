import type { LegalBuilder } from "./types";

/*
 * Terms & Conditions. The rules quoted here are the ones the code enforces (cancel window,
 * offers, quotations, reviews); the "disputes" section is the owner's "final decision" clause,
 * kept inside what the Consumer Protection Act, 2019 allows.
 */
export const termsDoc: LegalBuilder = {
  en: (f) => ({
    title: "Terms & Conditions",
    lead: `The agreement between you and ${f.business.legalName} when you use this website, create an account or place an order.`,
    sections: [
      {
        id: "about",
        title: "About these terms",
        blocks: [
          `These terms are an agreement between you and ${f.business.legalName}, ${f.business.address} ("the store", "we"). By using this website, creating an account, placing an order or asking for a quotation, you agree to them, together with our [Privacy Policy](/p/privacy-policy), [Refunds & Cancellations](/p/refunds-and-cancellations) and [Shipping & Delivery](/p/shipping-and-delivery) policies.`,
          "If you don't agree, please don't use the site. Some parts, such as school accounts, have extra terms below.",
        ],
      },
      {
        id: "accounts",
        title: "Your account",
        blocks: [
          {
            list: [
              "Give your real name and a mobile number you use, and keep your details up to date.",
              "Keep your password and sign-in codes secret. The store will never ask for them.",
              "You are responsible for what is done through your account.",
              "You must be 18 or older, or use the site with a parent's or guardian's permission and supervision.",
              "We may pause or close an account that is used for fraud, abuse or repeated fake orders, or that keeps refusing cash-on-delivery orders.",
            ],
          },
        ],
      },
      {
        id: "orders",
        title: "Orders and prices",
        blocks: [
          {
            list: [
              "Products on the site are an invitation to order. Your order is an offer to buy, and a contract is made when the store confirms it.",
              `Some items are provided by other local shops, and say so under the item ("Provided by …"). We still sell them to you ourselves: your order, bill, delivery, returns and refunds are all with ${f.business.legalName}.`,
              "Prices are in Indian rupees and include all taxes. Prices and stock are checked again when you confirm, and the price at that moment is the one on your order. Delivery charges are shown before you confirm.",
              "Each item may have a limit per order.",
              "If an item is listed at a clearly wrong price, or stock runs out, we may cancel that item or the order and refund anything you paid.",
              "Photos are for illustration. Packaging and colours may differ slightly.",
            ],
          },
        ],
      },
      {
        id: "unavailable",
        title: "When an item isn't available",
        blocks: [
          "In [Your account](/account) you choose what we do if an item is unavailable. A replacement is charged at the price of the item you ordered, never more. Items we couldn't pack are taken off your bill.",
        ],
      },
      {
        id: "payment",
        title: "Payment",
        blocks: [
          f.upiAtDoor
            ? "You **pay on delivery**: give the delivery partner the exact amount shown on your order in cash, or pay it by UPI straight to the store by scanning the QR code they show you. Pay by UPI only for your own order's amount, and show them the payment went through. Cash on delivery may not be available in every area or above a set amount; see [Shipping & Delivery](/p/shipping-and-delivery)."
            : "We take **cash on delivery** only: pay the delivery partner the exact amount shown on your order. It may not be available in every area or above a set amount; see [Shipping & Delivery](/p/shipping-and-delivery).",
        ],
      },
      {
        id: "delivery",
        title: "Delivery and handover",
        blocks: [
          "Delivery areas, charges and times are on [Shipping & Delivery](/p/shipping-and-delivery). Give the 6-digit delivery code to the delivery partner only once you have your order: it confirms that you received it. The order is yours, and your responsibility, from then on.",
        ],
      },
      {
        id: "cancellations",
        title: "Cancellations, returns and refunds",
        blocks: [
          "You can cancel an order until the store confirms it. Problems with a delivered order are reported from [Complaints & returns](/account/complaints). The full rules are on [Refunds & Cancellations](/p/refunds-and-cancellations).",
        ],
      },
      {
        id: "offers",
        title: "Offers and coupons",
        blocks: [
          {
            list: [
              "One offer per order. Each offer has its own dates, minimum basket, maximum discount and use limits, shown with the offer.",
              "We may change or end an offer at any time; orders already placed keep their discount.",
              "If an order is cancelled, the offer can be used again. If some items can't be packed, a percentage discount is worked out again on what was packed.",
              "Using several accounts or other tricks to get an offer more often than allowed may lead us to cancel the discount or the order.",
            ],
          },
        ],
      },
      {
        id: "schools",
        title: "School accounts and quotations",
        blocks: [
          {
            list: [
              "School representatives must be authorised by their school. The store approves each request to join and may remove access.",
              "Quotation prices are before GST. GST is added at the rate shown for each item: CGST and SGST within Maharashtra, IGST for other states.",
              "A quotation is valid until the end of the date shown on it (India time). Expired quotations can't be accepted.",
              "A quotation is the store's offer. It becomes binding only when a representative of the school accepts it before it expires. The store then contacts the school about delivery and billing.",
              "Terms printed on a quotation apply to it in addition to these terms. The store may close a request and will give the reason.",
            ],
          },
        ],
      },
      {
        id: "family",
        title: "Family accounts",
        blocks: [
          {
            list: [
              "A family's owner creates it and invites other adults with a link; each link lets one person in. A family can have up to 6 adults and 8 children, and each person can be in one family.",
              "The owner can remove adults and reset the invite link. Any adult can add, change or remove children. The owner can leave only by removing the others and deleting the family.",
              "Adults in the family see its orders and invoices, except orders marked private at checkout.",
            ],
          },
        ],
      },
      {
        id: "reviews",
        title: "Reviews, ratings and messages",
        blocks: [
          {
            list: [
              "Only customers who received a product can review it, once per product. Reviews are shown publicly with your account name.",
              "Reviews must be honest and about the product. Don't post abuse, hate, threats, other people's personal details, advertising, links, or anything unlawful.",
              "We may hide a review that breaks these rules and keep a note of why. Anyone can report a review.",
              "Order ratings and comments are private to the store. Chat messages are read and kept by store staff to help you.",
              "By posting a review you allow us to show it on this site.",
            ],
          },
        ],
      },
      {
        id: "fair-use",
        title: "Using the site fairly",
        blocks: [
          "Don't misuse the site: no attempts to break its security, automated copying, fake orders, pretending to be someone else, or abusive language towards staff or delivery partners. Store staff and delivery partners may use customers' details only for store work.",
        ],
      },
      {
        id: "liability",
        title: "Our responsibility",
        blocks: [
          "We take reasonable care to describe products correctly and to deliver on time. If we break these terms, we are responsible for loss you could reasonably have expected at the time of the order, up to the value of that order. We are not responsible for delays caused by events outside our control, such as severe weather, strikes or network failures.",
          "Nothing in these terms limits anything the law doesn't allow us to limit, including your rights as a consumer.",
        ],
      },
      {
        id: "disputes",
        title: "Disputes and final decision",
        blocks: [
          "If you're unhappy with an order, a return, a refund, an offer or anything else, contact us first through [Talk to the store](/account/support) or our grievance officer on [Contact & Grievance](/p/contact-and-grievance). We acknowledge complaints within 48 hours and aim to resolve them within one month.",
          `**${f.business.legalName} reviews every dispute, including how these terms and our policies apply, and its decision is final within the store's own process.**`,
          "**The website version applies.** The terms and policies published on this website when you placed your order are the ones that apply to it. They prevail over anything said in flyers, messages, calls or other copies.",
          "These terms are governed by the laws of India. Subject to your rights below, the courts at Raigad, Maharashtra have jurisdiction.",
          "Nothing in this section takes away your rights under the Consumer Protection Act, 2019. You can still contact the National Consumer Helpline (1915, [consumerhelpline.gov.in](https://consumerhelpline.gov.in)) or file a complaint with the Consumer Commission, including online through [e‑Daakhil](https://edaakhil.nic.in).",
        ],
      },
      {
        id: "changes",
        title: "Changes to these terms",
        blocks: [
          "We may update these terms. The version and date are at the top of this page. When you place an order you agree to the version shown at checkout; it is saved with your order and applies to that order.",
        ],
      },
    ],
  }),
};
