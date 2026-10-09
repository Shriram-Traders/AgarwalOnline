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
          {
            list: [
              "**Cash on delivery:** cancel from your order page until the store confirms the order.",
              "**Paid online:** these can't be cancelled from the site. Ask in [Talk to the store](/account/support). Until the order leaves with a delivery partner, the store can cancel it and refund you in full.",
              "We don't charge anything for cancelling.",
            ],
          },
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
          "If no one can receive the order, we try again or bring it back to the shop. If it can't be delivered, the order is cancelled: nothing is due for cash on delivery, and online payments are refunded.",
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
              ["Paid online", "Back to the card, UPI or account you paid with, through Razorpay. Banks usually take 5–7 working days to show it."],
              ["Cash on delivery", "In cash or by bank transfer. The reference is noted on your order."],
              ["Items not packed", "Taken off the bill for cash on delivery, refunded for online payments."],
              ["Payment after the hold", "If an online payment arrives after the 15-minute hold, the order is released and the payment refunded in full."],
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
  mr: (f) => ({
    title: "रद्द करणे व पैसे परत",
    lead: "ऑर्डर कधी रद्द करता येते, ऑर्डरमधील अडचण कशी कळवायची, आणि पैसे तुम्हाला कसे परत मिळतात.",
    sections: [
      {
        id: "cancel-by-you",
        title: "तुम्ही स्वतः ऑर्डर रद्द करणे",
        blocks: [
          {
            list: [
              "**कॅश ऑन डिलिव्हरी:** दुकान ऑर्डर पक्की करेपर्यंत तुमच्या ऑर्डरच्या पानावरून रद्द करा.",
              "**ऑनलाइन पैसे भरलेल्या ऑर्डर:** या साइटवरून रद्द करता येत नाहीत. [दुकानाशी बोला](/account/support) मध्ये विचारा. ऑर्डर डिलिव्हरी भागीदारासोबत निघेपर्यंत दुकान ती रद्द करून पूर्ण पैसे परत करू शकते.",
              "रद्द करण्यासाठी आम्ही कोणतेही शुल्क घेत नाही.",
            ],
          },
        ],
      },
      {
        id: "cancel-by-store",
        title: "दुकान ऑर्डर रद्द करते तेव्हा",
        blocks: [
          "एखादी वस्तू संपली असल्यास किंवा तिची किंमत चुकीची असल्यास, वितरण शक्य नसल्यास, किंवा ऑर्डर गैरवापरासारखी वाटल्यास दुकान ऑर्डर, किंवा तिचा काही भाग, रद्द करू शकते. आम्ही तुमच्या ऑर्डरच्या पानावर कारण सांगतो, आणि रद्द झालेल्या वस्तूंसाठी तुम्ही दिलेले सर्व पैसे परत करतो.",
        ],
      },
      {
        id: "failed-delivery",
        title: "वितरण होऊ शकले नाही तर",
        blocks: [
          "ऑर्डर घ्यायला कोणी नसल्यास, आम्ही पुन्हा प्रयत्न करतो किंवा ती दुकानात परत आणतो. ती पोहोचवता न आल्यास ऑर्डर रद्द होते: कॅश ऑन डिलिव्हरीसाठी काहीही देणे नसते, आणि ऑनलाइन भरलेले पैसे परत केले जातात.",
        ],
      },
      {
        id: "problems",
        title: "हरवलेल्या, खराब किंवा चुकीच्या वस्तू",
        blocks: [
          "वितरणानंतर, शक्य तितक्या लवकर [तक्रारी आणि परतावा](/account/complaints) मधून अडचण कळवा, आणि शक्य असल्यास फोटो जोडा. वस्तू आणि तिचे पॅकिंग जसे आले तसेच ठेवा. दुकान प्रत्येक विनंतीचा आढावा घेते आणि बदली वस्तू, परत घेणे किंवा पैसे परत देते, किंवा विनंती का नाकारली ते सांगते.",
        ],
      },
      {
        id: "returns",
        title: "वस्तू परत करणे",
        blocks: [
          "त्याच तक्रारीत वस्तू परत घेण्याची विनंती करा. हरवलेल्या, खराब, सदोष किंवा चुकीच्या आलेल्या वस्तू आम्ही सहसा परत घेतो; इतर वस्तू परत घेणे दुकानाच्या निर्णयावर आहे. परत घेणे मंजूर झाल्यास, आम्ही वस्तू नेण्याची व्यवस्था करतो आणि तारीख तुमच्या तक्रारीवर दाखवतो. परत करायच्या वस्तू, खराब किंवा सदोष आल्या नसल्यास, न वापरलेल्या आणि मिळाल्या तशाच स्थितीत असाव्यात.",
        ],
      },
      {
        id: "refunds",
        title: "पैसे कसे परत मिळतात",
        blocks: [
          {
            rows: [
              ["ऑनलाइन भरलेले", "Razorpay मार्फत, तुम्ही ज्या कार्ड, UPI किंवा खात्यातून भरले त्यातच परत. बँकांना ते दिसायला सहसा 5–7 कामकाजाचे दिवस लागतात."],
              ["कॅश ऑन डिलिव्हरी", "रोख किंवा बँक ट्रान्सफरने. त्याचा संदर्भ तुमच्या ऑर्डरवर नोंदवला जातो."],
              ["पॅक न झालेल्या वस्तू", "कॅश ऑन डिलिव्हरीसाठी बिलातून काढल्या जातात, ऑनलाइन पेमेंटसाठी पैसे परत केले जातात."],
              ["राखीव वेळेनंतर आलेले पेमेंट", "ऑनलाइन पेमेंट 15 मिनिटांच्या राखीव वेळेनंतर आल्यास, ऑर्डर सोडली जाते आणि पूर्ण पैसे परत केले जातात."],
            ],
          },
          "ऑर्डर रद्द झाल्याची खात्री झाल्यावर, किंवा परत केलेली वस्तू दुकानात पोहोचून तपासल्यावर पैसे परत करण्यास सुरुवात होते.",
        ],
      },
      {
        id: "decision",
        title: "दुकानाचा निर्णय",
        blocks: [
          `रद्द करणे, परत करणे आणि पैसे परत मागण्याच्या प्रत्येक विनंतीचा आढावा ${f.business.legalName} घेते, आणि [अटी व शर्ती](/p/terms-and-conditions#disputes) मध्ये सांगितल्याप्रमाणे दुकानाच्या स्वतःच्या प्रक्रियेत तिचा निर्णय अंतिम असतो. याचा ग्राहक कायद्यानुसार तुमच्या अधिकारांवर परिणाम होत नाही.`,
        ],
      },
    ],
  }),
};
