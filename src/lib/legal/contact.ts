import type { Locale } from "../locale-types";
import type { LegalBuilder, LegalFacts } from "./types";

const PENDING: Record<Locale, string> = { en: "Being added", mr: "लवकरच जोडले जाईल" };

/** A phone or email as a tap-to-call or tap-to-write link; the pending note when the owner hasn't saved one. */
function phone(f: LegalFacts, locale: Locale) {
  return f.business.phone ? `[${f.business.phone}](tel:+91${f.business.phone})` : PENDING[locale];
}
function email(f: LegalFacts, locale: Locale) {
  return f.business.email ? `[${f.business.email}](mailto:${f.business.email})` : PENDING[locale];
}

/* Contact & Grievance: who runs the shop and how complaints are handled, from Store settings. */
export const contactDoc: LegalBuilder = {
  en: (f) => ({
    title: "Contact & Grievance",
    lead: `How to reach ${f.business.legalName}, and how we handle complaints.`,
    sections: [
      {
        id: "store",
        title: "The store",
        blocks: [
          {
            rows: [
              ["Business name", f.business.legalName],
              ["Address", f.business.address],
              ["Phone", phone(f, "en")],
              ["Email", email(f, "en")],
              ...(f.business.gstin ? [["GSTIN", f.business.gstin] as [string, string]] : []),
            ],
          },
        ],
      },
      {
        id: "help",
        title: "Quickest help",
        blocks: [
          {
            list: [
              "Questions about an order: [Talk to the store](/account/support) (sign in first).",
              "Missing, damaged or wrong items, and returns: [Complaints & returns](/account/complaints).",
            ],
          },
        ],
      },
      {
        id: "grievance",
        title: "Grievance officer",
        blocks: [
          "For complaints about the shop, an order or your personal data, as the Consumer Protection (E-Commerce) Rules, 2020, the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023 require:",
          {
            rows: [
              ["Name", f.business.grievanceName ?? PENDING.en],
              ["Designation", f.business.grievanceDesignation ?? PENDING.en],
              ["Phone", phone(f, "en")],
              ["Email", email(f, "en")],
              ["Address", f.business.address],
            ],
          },
        ],
      },
      {
        id: "timeline",
        title: "What happens next",
        blocks: [
          "Tell us your order number and what went wrong. We acknowledge every complaint within 48 hours and aim to resolve it within one month, and we tell you what we decided and why.",
        ],
      },
      {
        id: "outside",
        title: "If you're not satisfied",
        blocks: [
          {
            list: [
              "National Consumer Helpline: call 1915, or visit [consumerhelpline.gov.in](https://consumerhelpline.gov.in).",
              "File a consumer complaint online on [e-Daakhil](https://edaakhil.nic.in).",
              "For complaints about your personal data, after contacting us: the Data Protection Board of India.",
            ],
          },
          "Our [Terms & Conditions](/p/terms-and-conditions#disputes) explain how disputes are decided.",
        ],
      },
    ],
  }),
  mr: (f) => ({
    title: "संपर्क व तक्रार निवारण",
    lead: `${f.business.legalName} शी संपर्क कसा साधायचा, आणि आम्ही तक्रारी कशा हाताळतो.`,
    sections: [
      {
        id: "store",
        title: "दुकान",
        blocks: [
          {
            rows: [
              ["व्यवसायाचे नाव", f.business.legalName],
              ["पत्ता", f.business.address],
              ["फोन", phone(f, "mr")],
              ["ईमेल", email(f, "mr")],
              ...(f.business.gstin ? [["GSTIN", f.business.gstin] as [string, string]] : []),
            ],
          },
        ],
      },
      {
        id: "help",
        title: "लवकर मदत",
        blocks: [
          {
            list: [
              "ऑर्डरविषयी प्रश्न: [दुकानाशी बोला](/account/support) (आधी साइन इन करा).",
              "हरवलेल्या, खराब किंवा चुकीच्या वस्तू, आणि परत करणे: [तक्रारी आणि परतावा](/account/complaints).",
            ],
          },
        ],
      },
      {
        id: "grievance",
        title: "तक्रार निवारण अधिकारी",
        blocks: [
          "ग्राहक संरक्षण (ई-कॉमर्स) नियम, 2020, माहिती तंत्रज्ञान कायदा, 2000 आणि डिजिटल वैयक्तिक डेटा संरक्षण कायदा, 2023 नुसार, दुकान, ऑर्डर किंवा तुमच्या वैयक्तिक माहितीबद्दलच्या तक्रारींसाठी:",
          {
            rows: [
              ["नाव", f.business.grievanceName ?? PENDING.mr],
              ["पद", f.business.grievanceDesignation ?? PENDING.mr],
              ["फोन", phone(f, "mr")],
              ["ईमेल", email(f, "mr")],
              ["पत्ता", f.business.address],
            ],
          },
        ],
      },
      {
        id: "timeline",
        title: "पुढे काय होते",
        blocks: [
          "तुमचा ऑर्डर क्रमांक आणि काय चुकले ते सांगा. आम्ही प्रत्येक तक्रारीची 48 तासांत पोच देतो आणि एका महिन्यात ती सोडवण्याचा प्रयत्न करतो, आणि आम्ही काय ठरवले व का, ते तुम्हाला सांगतो.",
        ],
      },
      {
        id: "outside",
        title: "समाधान न झाल्यास",
        blocks: [
          {
            list: [
              "राष्ट्रीय ग्राहक हेल्पलाइन: 1915 वर फोन करा, किंवा [consumerhelpline.gov.in](https://consumerhelpline.gov.in) ला भेट द्या.",
              "[e-Daakhil](https://edaakhil.nic.in) वर ऑनलाइन ग्राहक तक्रार दाखल करा.",
              "तुमच्या वैयक्तिक माहितीबद्दलच्या तक्रारींसाठी, आमच्याशी संपर्क साधल्यानंतर: भारतीय डेटा संरक्षण मंडळ.",
            ],
          },
          "वाद कसे ठरवले जातात हे आमच्या [अटी व शर्ती](/p/terms-and-conditions#disputes) मध्ये सांगितले आहे.",
        ],
      },
    ],
  }),
};
