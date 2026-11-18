import { dateText, daysText, price } from "./format";
import type { LegalArea, LegalBuilder, LegalFacts } from "./types";

/** "Monday–Saturday: 10:00 AM – 1:00 PM, 4:00 PM – 7:00 PM", one part per set of days. */
function timesText(area: LegalArea) {
  const byDays = new Map<string, { days: number[]; windows: string[] }>();
  for (const time of area.times) {
    const key = [...time.days].sort().join(",");
    const group = byDays.get(key) ?? { days: time.days, windows: [] };
    group.windows.push(time.window);
    byDays.set(key, group);
  }
  return [...byDays.values()].map((group) => `${daysText(group.days, "en")}: ${group.windows.join(", ")}`).join("; ");
}

function areaRows(f: LegalFacts): [string, string][] {
  return f.areas.map((area) => {
    const fee = `Delivery ${price(area.feePaise)}, free from ${price(f.freeThresholdPaise)}.`;
    const cod = area.codEnabled ? `Cash on delivery up to ${price(area.codLimitPaise)}.` : "No cash on delivery.";
    const times = area.times.length ? ` ${timesText(area)}.` : "";
    return [area.name, `${fee} ${cod}${times}`];
  });
}

/* Shipping & Delivery: every number comes from Store settings, so the page changes when the owner does. */
export const shippingDoc: LegalBuilder = {
  en: (f) => ({
    title: "Shipping & Delivery",
    lead: `Where ${f.business.legalName} delivers, what it costs and when your order arrives.`,
    sections: [
      {
        id: "areas",
        title: "Where we deliver",
        blocks: f.areas.length
          ? [
              "We deliver with our own delivery partners to these areas:",
              { rows: areaRows(f) },
              "Check your PIN code on [Check delivery area](/serviceability).",
            ]
          : ["Delivery areas are being set up. Check your PIN code on [Check delivery area](/serviceability)."],
      },
      {
        id: "charges",
        title: "Delivery charges",
        blocks: [
          `${f.areas.length ? "Each area has its delivery charge, shown above." : "Each area has its own delivery charge."} Delivery is free when the items in your basket add up to ${price(f.freeThresholdPaise)} or more. The exact charge is shown at checkout before you confirm.`,
        ],
      },
      {
        id: "times",
        title: "Delivery days and times",
        blocks: [
          {
            list: [
              `Orders placed before ${f.cutoff} can arrive the same day; later orders go to the next delivery day.`,
              "You pick a delivery time at checkout from the times open for your address. A same-day time closes one hour before it ends, and busy times can fill up.",
              ...(f.holidays.length ? [`No deliveries on ${daysText(f.holidays, "en")}.`] : []),
              ...(f.blackoutDates.length
                ? [`No deliveries on ${f.blackoutDates.map((date) => dateText(date, "en")).join(", ")}.`]
                : []),
            ],
          },
        ],
      },
      {
        id: "handover",
        title: "Receiving your order",
        blocks: [
          "Your delivery partner brings the order to the address you chose. Give them the 6-digit delivery code only when you have the order: it confirms the delivery. The code is on your order page from the moment you order, and we send the same code to the order's phone number when it leaves the shop. Anyone at the address who has the code can receive it. For cash on delivery, please have the exact amount ready.",
        ],
      },
      {
        id: "problems",
        title: "Delays and failed deliveries",
        blocks: [
          "You can follow your order on its order page. If no one can receive it, we try again or bring it back to the shop; see [Refunds & Cancellations](/p/refunds-and-cancellations). We aren't responsible for delays caused by events outside our control.",
        ],
      },
      {
        id: "schools",
        title: "School orders",
        blocks: [
          "When a school accepts a quotation, the store arranges delivery and billing directly with the school.",
        ],
      },
    ],
  }),
};
