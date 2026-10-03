import { normalizeSearch } from "../catalog/search";
import type { Intent } from "./types";

/*
 * What a shopper is asking about, from plain words in English, Marathi or Hinglish. No AI:
 * a message that matches no topic is treated as a product search. Order matters: "cash on
 * delivery" is about payment, "damaged order" about returns, "school bag" is a product.
 */

/** Latin keywords match whole words or phrases; Devanagari ones match inside a word ("वितरणासाठी"). */
const KEYWORDS: [Intent, string[]][] = [
  [
    "human",
    ["talk to", "speak to", "call", "human", "person", "agent", "staff", "shopkeeper", "contact", "phone number", "whatsapp", "customer care", "बोला", "बोलायचे", "संपर्क", "फोन"],
  ],
  [
    "returns",
    ["return", "returns", "refund", "replace", "replacement", "exchange", "damaged", "broken", "missing", "wrong item", "complaint", "complain", "defective", "परत", "तक्रार", "खराब", "तुटले", "तुटलेल", "चुकीची"],
  ],
  [
    "school",
    ["bulk", "wholesale", "quotation", "quote", "school order", "school account", "for my school", "for our school", "for school", "शाळेसाठी", "शाळेची ऑर्डर", "घाऊक", "कोटेशन"],
  ],
  [
    "order",
    ["my order", "my orders", "order status", "track", "tracking", "where is my", "my delivery", "cancel", "order", "orders", "ऑर्डर", "माझी ऑर्डर"],
  ],
  [
    "payment",
    ["payment", "pay", "paying", "cod", "cash on delivery", "cash", "upi", "gpay", "google pay", "phonepe", "paytm", "debit card", "credit card", "card payment", "net banking", "पेमेंट", "पैसे", "रोख"],
  ],
  [
    "delivery",
    ["delivery", "deliver", "delivered", "shipping", "same day", "free delivery", "delivery charge", "charges", "fee", "area", "areas", "pincode", "pin code", "kab", "kab tak", "how long", "when", "timing", "वितरण", "डिलिव्हरी", "पोहोच", "क्षेत्र", "पिन कोड"],
  ],
];
/** Things the shop sells whose names contain a topic word: these are always a product search. */
const PRODUCT_PHRASES = ["return gift", "return gifts", "greeting card", "greeting cards", "gift card", "cash book", "cash memo", "safety pin", "safety pins", "time table", "order book", "bill book"];
const GREETINGS = ["hi", "hii", "hello", "hey", "namaste", "namaskar", "good morning", "good evening", "नमस्कार", "नमस्ते"];
const THANKS = ["thanks", "thank you", "thankyou", "thx", "ty", "dhanyavad", "धन्यवाद", "आभार"];

/** Words that wrap a product question and would stop the shop search finding anything. */
const FILLER = new Set(
  (
    "do does you have has any i want need needed looking for show me the a an some please pls price of is are " +
    "there in stock available can get buy what which kya hai he ka ki ke chahiye mujhe milega aahe ahe ka pahije " +
    "आहे आहेत का पाहिजे हवे हवा हवी हव्या मला दाखवा तुमच्याकडे किंमत मिळेल"
  ).split(" "),
);

const DEVANAGARI = /[ऀ-ॿ]/;
const has = (text: string, keyword: string) =>
  DEVANAGARI.test(keyword) ? text.includes(keyword) : ` ${text} `.includes(` ${keyword} `);

/** A 6-digit Indian PIN code anywhere in the message. */
export function pinIn(text: string) {
  return text.match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? null;
}

export function matchIntent(raw: string): Intent | null {
  const text = normalizeSearch(raw);
  if (!text) return null;
  if (pinIn(text)) return "pin";
  const words = text.split(" ").length;
  if (words <= 3 && GREETINGS.some((word) => has(text, word))) return "greeting";
  if (words <= 4 && THANKS.some((word) => has(text, word))) return "thanks";
  if (PRODUCT_PHRASES.some((phrase) => has(text, phrase))) return null;
  for (const [intent, keywords] of KEYWORDS) if (keywords.some((keyword) => has(text, keyword))) return intent;
  return null;
}

/** The product words in a question: "do you have long notebooks?" → "long notebooks". */
export function productQuery(raw: string) {
  const text = normalizeSearch(raw);
  const kept = text.split(" ").filter((word) => word && !FILLER.has(word));
  return (kept.length ? kept.join(" ") : text).slice(0, 60);
}
