import { formatPrice } from "./display";
import type { Locale } from "./locale-types";

/** What the answers quote, from Store settings, so they never promise something the shop has changed. */
export type FaqFacts = {
  /** Live delivery areas, by name. */
  areas: string[];
  /** Each live area's delivery fee, in paise. */
  feesPaise: number[];
  /** Same-day cutoff, "3 PM". */
  cutoff: string;
  freeFromPaise: number;
  /** Online payment switched on (paymentsEnabled). */
  online: boolean;
  /** Paying the rider by UPI at the door is on (the shop has a UPI ID). */
  upi?: boolean;
};

/**
 * The home page's questions people ask before a first order. Answers use the policy pages' text
 * format (`[label](/href)` links), rendered by LegalText.
 */
export function homeFaq(locale: Locale, f: FaqFacts): { q: string; a: string }[] {
  const free = formatPrice(f.freeFromPaise);
  const low = f.feesPaise.length ? Math.min(...f.feesPaise) : 0;
  const sameFee = f.feesPaise.every((fee) => fee === low);
  const areas = f.areas.join(", ");
  if (locale === "mr")
    return [
      {
        q: "तुम्ही माझ्या भागात डिलिव्हरी करता का?",
        a: f.areas.length
          ? `आम्ही ${areas} मध्ये डिलिव्हरी करतो. खात्री करण्यासाठी [वितरण क्षेत्र तपासा](/serviceability) वर तुमचा PIN कोड टाका.`
          : "वितरण क्षेत्रे तयार होत आहेत. [वितरण क्षेत्र तपासा](/serviceability) वर तुमचा PIN कोड तपासा.",
      },
      {
        q: "माझी ऑर्डर कधी येईल?",
        a: `${f.cutoff} पूर्वी ऑर्डर केल्यास ती त्याच दिवशी पोहोचू शकते; त्यानंतरच्या ऑर्डर पुढच्या वितरण दिवशी येतात. चेकआउटवर तुम्ही वितरणाची वेळ निवडता.`,
      },
      {
        q: "डिलिव्हरीचे शुल्क किती?",
        a: !f.feesPaise.length
          ? `बास्केट ${free} किंवा अधिक असल्यास डिलिव्हरी मोफत.`
          : sameFee
            ? `प्रत्येक ऑर्डरला ${formatPrice(low)}, आणि बास्केट ${free} किंवा अधिक असल्यास मोफत.`
            : `तुमच्या भागानुसार प्रत्येक ऑर्डरला ${formatPrice(low)} पासून, आणि बास्केट ${free} किंवा अधिक असल्यास मोफत.`,
      },
      {
        q: "पैसे कसे द्यायचे?",
        a: f.online
          ? "ऑर्डर आल्यावर डिलिव्हरी भागीदाराला रोख द्या, किंवा चेकआउटवर ऑनलाइन भरा."
          : "कॅश ऑन डिलिव्हरी: ऑर्डर आल्यावर डिलिव्हरी भागीदाराला पैसे द्या. कृपया नेमकी रक्कम तयार ठेवा.",
      },
      {
        q: "एखादी वस्तू कमी, खराब किंवा चुकीची आली तर?",
        a: "तुमच्या खात्यातील [तक्रारी आणि परतावा](/account/complaints) मधून कळवा. आम्ही बदली वस्तू, परत घेणे किंवा पैसे परत देऊ, किंवा का नाही ते सांगू. [रद्द करणे व पैसे परत](/p/refunds-and-cancellations) पाहा.",
      },
      {
        q: "खाते आवश्यक आहे का?",
        a: "खाते न उघडताही तुम्ही वस्तू पाहू शकता आणि बास्केट भरू शकता. ऑर्डर करण्यासाठी मोबाइल नंबरने साइन इन करा, म्हणजे डिलिव्हरीबद्दल आम्ही तुमच्याशी संपर्क साधू शकू.",
      },
      {
        q: "हे अग्रवाल जनरल स्टोअरच आहे का?",
        a: "हो. अग्रवाल ऑनलाइन ही नागोठण्याच्या बाजारपेठेतील अग्रवाल जनरल स्टोअरची वेबसाइट आहे: तेच दुकान, फक्त डिलिव्हरीची सोय जोडलेली.",
      },
    ];
  return [
    {
      q: "Do you deliver to my area?",
      a: f.areas.length
        ? `We deliver in ${areas}. Enter your PIN code on [Check delivery area](/serviceability) to be sure.`
        : "Delivery areas are being set up. Check your PIN code on [Check delivery area](/serviceability).",
    },
    {
      q: "When will my order arrive?",
      a: `Order before ${f.cutoff} and it can reach you the same day; later orders come on the next delivery day. You pick a delivery time at checkout.`,
    },
    {
      q: "How much is delivery?",
      a: !f.feesPaise.length
        ? `Delivery is free when your basket is ${free} or more.`
        : sameFee
          ? `${formatPrice(low)} per order, and free when your basket is ${free} or more.`
          : `From ${formatPrice(low)} per order, depending on your area, and free when your basket is ${free} or more.`,
    },
    {
      q: "How do I pay?",
      a: f.online
        ? "Pay cash to the delivery partner when your order arrives, or pay online at checkout."
        : f.upi
          ? "Pay when your order arrives: cash to the delivery partner, or UPI straight to the shop by scanning the QR code they show you."
          : "Cash on delivery: pay the delivery partner when your order arrives. Please keep the exact amount ready.",
    },
    {
      q: "What if something is missing, damaged or wrong?",
      a: "Report it from [Complaints & returns](/account/complaints) in your account. We'll offer a replacement, a return or a refund, or explain why not. See [Refunds & Cancellations](/p/refunds-and-cancellations).",
    },
    {
      q: "Do I need an account?",
      a: "You can browse and fill your basket without one. To order, sign in with your mobile number so we can reach you about the delivery.",
    },
    {
      q: "Is this Agarwal General Store?",
      a: "Yes. Agarwal Online is the website of Agarwal General Stores in Bazar Peth, Nagothane: the same shop, with delivery added.",
    },
  ];
}
