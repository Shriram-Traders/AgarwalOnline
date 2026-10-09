import type { Locale } from "../locale-types";
import { dateText, daysText, price } from "./format";
import type { LegalArea, LegalBuilder, LegalFacts } from "./types";

/** "Monday–Saturday: 10:00 AM – 1:00 PM, 4:00 PM – 7:00 PM", one part per set of days. */
function timesText(area: LegalArea, locale: Locale) {
  const byDays = new Map<string, { days: number[]; windows: string[] }>();
  for (const time of area.times) {
    const key = [...time.days].sort().join(",");
    const group = byDays.get(key) ?? { days: time.days, windows: [] };
    group.windows.push(time.window);
    byDays.set(key, group);
  }
  return [...byDays.values()].map((group) => `${daysText(group.days, locale)}: ${group.windows.join(", ")}`).join("; ");
}

function areaRows(f: LegalFacts, locale: Locale): [string, string][] {
  const mr = locale === "mr";
  return f.areas.map((area) => {
    const fee = mr
      ? `वितरण शुल्क ${price(area.feePaise)}, ${price(f.freeThresholdPaise)} पासून मोफत.`
      : `Delivery ${price(area.feePaise)}, free from ${price(f.freeThresholdPaise)}.`;
    const cod = area.codEnabled
      ? mr
        ? `${price(area.codLimitPaise)} पर्यंत कॅश ऑन डिलिव्हरी.`
        : `Cash on delivery up to ${price(area.codLimitPaise)}.`
      : mr
        ? "कॅश ऑन डिलिव्हरी उपलब्ध नाही."
        : "No cash on delivery.";
    const times = area.times.length ? ` ${timesText(area, locale)}.` : "";
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
              { rows: areaRows(f, "en") },
              "Check your PIN code on [Check delivery area](/serviceability).",
            ]
          : ["Delivery areas are being set up. Check your PIN code on [Check delivery area](/serviceability)."],
      },
      {
        id: "charges",
        title: "Delivery charges",
        blocks: [
          `Each area has its delivery charge, shown above. Delivery is free when the items in your basket add up to ${price(f.freeThresholdPaise)} or more. The exact charge is shown at checkout before you confirm.`,
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
          "Your delivery partner brings the order to the address you chose. Give them the 6-digit delivery code only when you have the order: it confirms the delivery. Anyone at the address who has the code can receive it. For cash on delivery, please have the exact amount ready.",
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
  mr: (f) => ({
    title: "शिपिंग व वितरण",
    lead: `${f.business.legalName} कुठे वितरण करते, त्याचा खर्च किती, आणि तुमची ऑर्डर कधी पोहोचते.`,
    sections: [
      {
        id: "areas",
        title: "आम्ही कुठे वितरण करतो",
        blocks: f.areas.length
          ? [
              "आम्ही आमच्या स्वतःच्या डिलिव्हरी भागीदारांमार्फत या भागांत वितरण करतो:",
              { rows: areaRows(f, "mr") },
              "तुमचा पिन कोड [वितरण क्षेत्र तपासा](/serviceability) वर तपासा.",
            ]
          : ["वितरण क्षेत्रे सुरू केली जात आहेत. तुमचा पिन कोड [वितरण क्षेत्र तपासा](/serviceability) वर तपासा."],
      },
      {
        id: "charges",
        title: "वितरण शुल्क",
        blocks: [
          `प्रत्येक क्षेत्राचे वितरण शुल्क वर दाखवले आहे. तुमच्या बास्केटमधील वस्तूंची एकूण किंमत ${price(f.freeThresholdPaise)} किंवा अधिक असल्यास वितरण मोफत. नेमके शुल्क चेकआउटवर, पक्की करण्यापूर्वी दाखवले जाते.`,
        ],
      },
      {
        id: "times",
        title: "वितरणाचे दिवस आणि वेळा",
        blocks: [
          {
            list: [
              `${f.cutoff} पूर्वी दिलेल्या ऑर्डर त्याच दिवशी पोहोचू शकतात; नंतरच्या ऑर्डर पुढच्या वितरण दिवशी जातात.`,
              "चेकआउटवर तुमच्या पत्त्यासाठी उपलब्ध वेळांमधून तुम्ही वितरणाची वेळ निवडता. त्याच दिवसाची वेळ ती संपण्याच्या एक तास आधी बंद होते, आणि गर्दीच्या वेळा भरू शकतात.",
              ...(f.holidays.length ? [`${daysText(f.holidays, "mr")} रोजी वितरण नाही.`] : []),
              ...(f.blackoutDates.length
                ? [`${f.blackoutDates.map((date) => dateText(date, "mr")).join(", ")} रोजी वितरण नाही.`]
                : []),
            ],
          },
        ],
      },
      {
        id: "handover",
        title: "तुमची ऑर्डर घेणे",
        blocks: [
          "तुमचा डिलिव्हरी भागीदार तुम्ही निवडलेल्या पत्त्यावर ऑर्डर आणतो. ऑर्डर हातात मिळाल्यावरच त्यांना 6 अंकी वितरण कोड द्या: त्यावरून वितरणाची खात्री होते. पत्त्यावर कोड असलेली कोणतीही व्यक्ती ऑर्डर घेऊ शकते. कॅश ऑन डिलिव्हरीसाठी कृपया नेमकी रक्कम तयार ठेवा.",
        ],
      },
      {
        id: "problems",
        title: "उशीर आणि न झालेले वितरण",
        blocks: [
          "तुमची ऑर्डर कुठवर आली ते तिच्या पानावर पाहता येते. ऑर्डर घ्यायला कोणी नसल्यास, आम्ही पुन्हा प्रयत्न करतो किंवा ती दुकानात परत आणतो; [रद्द करणे व पैसे परत](/p/refunds-and-cancellations) पाहा. आमच्या नियंत्रणाबाहेरील घटनांमुळे होणाऱ्या उशिरासाठी आम्ही जबाबदार नाही.",
        ],
      },
      {
        id: "schools",
        title: "शाळांच्या ऑर्डर",
        blocks: ["शाळेने कोटेशन स्वीकारल्यावर, दुकान वितरण आणि बिलिंगची व्यवस्था थेट शाळेसोबत करते."],
      },
    ],
  }),
};
