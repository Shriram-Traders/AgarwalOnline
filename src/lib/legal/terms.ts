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
              "Prices are in Indian rupees. Prices and stock are checked again when you confirm, and the price at that moment is the one on your order. Delivery charges are shown before you confirm.",
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
          "In [Your account](/account) you choose what we do if an item is unavailable. A replacement is charged at the price of the item you ordered, never more. Items we couldn't pack are taken off your bill for cash on delivery, or refunded for online payments.",
        ],
      },
      {
        id: "payment",
        title: "Payment",
        blocks: [
          {
            list: [
              "**Cash on delivery:** pay the delivery partner the exact amount shown on your order. It may not be available in every area or above a set amount; see [Shipping & Delivery](/p/shipping-and-delivery).",
              "**Online payment**, when it is switched on, is handled by Razorpay. Your items are held for 15 minutes while you pay. If payment doesn't finish in time the order is released, and a payment that arrives late is refunded in full.",
              "We never see or store your card or UPI details.",
            ],
          },
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
          "You can cancel a cash-on-delivery order until the store confirms it. Problems with a delivered order are reported from [Complaints & returns](/account/complaints). The full rules are on [Refunds & Cancellations](/p/refunds-and-cancellations).",
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
          "**The website version applies.** The terms and policies published on this website when you placed your order are the ones that apply to it. They prevail over anything said in flyers, messages, calls or other copies. If the English and Marathi versions differ, the English version prevails.",
          "These terms are governed by the laws of India. Subject to your rights below, the courts at Raigad, Maharashtra have jurisdiction.",
          "Nothing in this section takes away your rights under the Consumer Protection Act, 2019. You can still contact the National Consumer Helpline (1915, [consumerhelpline.gov.in](https://consumerhelpline.gov.in)) or file a complaint with the Consumer Commission, including online through [e-Daakhil](https://edaakhil.nic.in).",
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
  mr: (f) => ({
    title: "अटी व शर्ती",
    lead: `तुम्ही ही वेबसाइट वापरता, खाते तयार करता किंवा ऑर्डर देता तेव्हा तुमच्या आणि ${f.business.legalName} मधील करार.`,
    sections: [
      {
        id: "about",
        title: "या अटींविषयी",
        blocks: [
          `या अटी तुमच्या आणि ${f.business.legalName}, ${f.business.address} ("दुकान", "आम्ही") यांच्यातील करार आहेत. ही वेबसाइट वापरून, खाते तयार करून, ऑर्डर देऊन किंवा कोटेशन मागून तुम्ही त्या मान्य करता, आमचे [गोपनीयता धोरण](/p/privacy-policy), [रद्द करणे व पैसे परत](/p/refunds-and-cancellations) आणि [शिपिंग व वितरण](/p/shipping-and-delivery) धोरणांसह.`,
          "तुम्हाला मान्य नसल्यास कृपया साइट वापरू नका. शाळा खात्यांसारख्या काही भागांसाठी खाली जास्तीच्या अटी आहेत.",
        ],
      },
      {
        id: "accounts",
        title: "तुमचे खाते",
        blocks: [
          {
            list: [
              "तुमचे खरे नाव आणि तुम्ही वापरता तो मोबाइल नंबर द्या, आणि तपशील अद्ययावत ठेवा.",
              "तुमचा पासवर्ड आणि साइन-इन कोड गुप्त ठेवा. दुकान ते कधीही विचारणार नाही.",
              "तुमच्या खात्यातून जे काही केले जाते त्याची जबाबदारी तुमची आहे.",
              "तुमचे वय 18 किंवा अधिक असावे, किंवा पालक/संरक्षकांच्या परवानगीने व देखरेखीखाली साइट वापरावी.",
              "फसवणूक, गैरवर्तन किंवा वारंवार खोट्या ऑर्डरसाठी वापरले जाणारे, किंवा कॅश-ऑन-डिलिव्हरी ऑर्डर वारंवार नाकारणारे खाते आम्ही थांबवू किंवा बंद करू शकतो.",
            ],
          },
        ],
      },
      {
        id: "orders",
        title: "ऑर्डर आणि किमती",
        blocks: [
          {
            list: [
              "साइटवरील उत्पादने हे ऑर्डर देण्याचे आमंत्रण आहे. तुमची ऑर्डर ही खरेदीची ऑफर आहे, आणि दुकान ती पक्की करते तेव्हा करार होतो.",
              "किमती भारतीय रुपयांत आहेत. तुम्ही ऑर्डर पक्की करताना किमती आणि साठा पुन्हा तपासला जातो, आणि त्या क्षणाची किंमत तुमच्या ऑर्डरवर राहते. वितरण शुल्क पक्की करण्यापूर्वी दाखवले जाते.",
              "प्रत्येक वस्तूवर एका ऑर्डरसाठी मर्यादा असू शकते.",
              "एखाद्या वस्तूची किंमत स्पष्टपणे चुकीची दाखवली गेल्यास, किंवा साठा संपल्यास, आम्ही ती वस्तू किंवा ऑर्डर रद्द करून तुम्ही दिलेले पैसे परत करू शकतो.",
              "फोटो फक्त कल्पना येण्यासाठी आहेत. पॅकिंग आणि रंग थोडे वेगळे असू शकतात.",
            ],
          },
        ],
      },
      {
        id: "unavailable",
        title: "वस्तू उपलब्ध नसल्यास",
        blocks: [
          "वस्तू उपलब्ध नसल्यास आम्ही काय करावे हे तुम्ही [तुमचे खाते](/account) मध्ये निवडता. बदली वस्तूसाठी तुम्ही ऑर्डर केलेल्या वस्तूचीच किंमत घेतली जाते, कधीही जास्त नाही. आम्ही पॅक करू न शकलेल्या वस्तू कॅश ऑन डिलिव्हरीच्या बिलातून काढल्या जातात, किंवा ऑनलाइन पेमेंटसाठी त्यांचे पैसे परत केले जातात.",
        ],
      },
      {
        id: "payment",
        title: "पेमेंट",
        blocks: [
          {
            list: [
              "**कॅश ऑन डिलिव्हरी:** तुमच्या ऑर्डरवर दाखवलेली नेमकी रक्कम डिलिव्हरी भागीदाराला द्या. ती प्रत्येक क्षेत्रात किंवा ठरावीक रकमेपेक्षा जास्त ऑर्डरसाठी उपलब्ध नसू शकते; [शिपिंग व वितरण](/p/shipping-and-delivery) पाहा.",
              "**ऑनलाइन पेमेंट** सुरू असल्यास ते Razorpay हाताळते. तुम्ही पैसे भरेपर्यंत तुमच्या वस्तू 15 मिनिटे राखून ठेवल्या जातात. वेळेत पेमेंट पूर्ण न झाल्यास ऑर्डर सोडली जाते, आणि उशिरा आलेले पेमेंट पूर्ण परत केले जाते.",
              "तुमचे कार्ड किंवा UPI तपशील आम्ही कधीही पाहत नाही आणि साठवत नाही.",
            ],
          },
        ],
      },
      {
        id: "delivery",
        title: "वितरण आणि ऑर्डर हातात देणे",
        blocks: [
          "वितरण क्षेत्रे, शुल्क आणि वेळा [शिपिंग व वितरण](/p/shipping-and-delivery) वर आहेत. ऑर्डर हातात मिळाल्यावरच 6 अंकी वितरण कोड डिलिव्हरी भागीदाराला द्या: त्यावरून तुम्हाला ऑर्डर मिळाल्याची खात्री होते. तेव्हापासून ऑर्डर तुमची, आणि तुमच्या जबाबदारीवर असते.",
        ],
      },
      {
        id: "cancellations",
        title: "रद्द करणे, परत करणे आणि पैसे परत",
        blocks: [
          "दुकान ऑर्डर पक्की करेपर्यंत तुम्ही कॅश-ऑन-डिलिव्हरी ऑर्डर रद्द करू शकता. मिळालेल्या ऑर्डरमधील अडचणी [तक्रारी आणि परतावा](/account/complaints) मधून कळवा. पूर्ण नियम [रद्द करणे व पैसे परत](/p/refunds-and-cancellations) वर आहेत.",
        ],
      },
      {
        id: "offers",
        title: "ऑफर आणि कूपन",
        blocks: [
          {
            list: [
              "एका ऑर्डरवर एकच ऑफर. प्रत्येक ऑफरच्या स्वतःच्या तारखा, किमान बास्केट, जास्तीत जास्त सवलत आणि वापराच्या मर्यादा ऑफरसोबत दाखवल्या जातात.",
              "आम्ही कोणतीही ऑफर कधीही बदलू किंवा बंद करू शकतो; आधी दिलेल्या ऑर्डरची सवलत तशीच राहते.",
              "ऑर्डर रद्द झाल्यास ऑफर पुन्हा वापरता येते. काही वस्तू पॅक करता न आल्यास, टक्केवारीची सवलत पॅक केलेल्या वस्तूंवर पुन्हा मोजली जाते.",
              "परवानगीपेक्षा जास्त वेळा ऑफर मिळवण्यासाठी अनेक खाती किंवा इतर युक्त्या वापरल्यास आम्ही सवलत किंवा ऑर्डर रद्द करू शकतो.",
            ],
          },
        ],
      },
      {
        id: "schools",
        title: "शाळा खाती आणि कोटेशन",
        blocks: [
          {
            list: [
              "शाळेच्या प्रतिनिधींना त्यांच्या शाळेची परवानगी असावी. सामील होण्याची प्रत्येक विनंती दुकान मंजूर करते आणि प्रवेश काढूनही घेऊ शकते.",
              "कोटेशनमधील किमती GST पूर्वीच्या आहेत. प्रत्येक वस्तूसाठी दाखवलेल्या दराने GST जोडला जातो: महाराष्ट्रात CGST आणि SGST, इतर राज्यांसाठी IGST.",
              "कोटेशन त्यावर दाखवलेल्या तारखेच्या शेवटपर्यंत (भारतीय वेळ) वैध असते. मुदत संपलेले कोटेशन स्वीकारता येत नाही.",
              "कोटेशन ही दुकानाची ऑफर आहे. मुदत संपण्यापूर्वी शाळेच्या प्रतिनिधीने ती स्वीकारल्यावरच ती बंधनकारक होते. त्यानंतर वितरण व बिलिंगबद्दल दुकान शाळेशी संपर्क साधते.",
              "कोटेशनवर छापलेल्या अटी या अटींसोबत त्या कोटेशनला लागू होतात. दुकान एखादी विनंती बंद करू शकते आणि त्याचे कारण सांगेल.",
            ],
          },
        ],
      },
      {
        id: "reviews",
        title: "रिव्ह्यू, रेटिंग आणि संदेश",
        blocks: [
          {
            list: [
              "उत्पादन मिळालेले ग्राहकच त्याचा रिव्ह्यू लिहू शकतात, एका उत्पादनासाठी एकदा. रिव्ह्यू तुमच्या खात्याच्या नावासह सर्वांना दिसतात.",
              "रिव्ह्यू प्रामाणिक आणि उत्पादनाविषयी असावेत. शिवीगाळ, द्वेष, धमक्या, इतरांचे वैयक्तिक तपशील, जाहिरात, लिंक किंवा बेकायदेशीर काहीही लिहू नका.",
              "हे नियम मोडणारा रिव्ह्यू आम्ही लपवू शकतो आणि त्याचे कारण नोंदवून ठेवतो. कोणीही एखाद्या रिव्ह्यूची तक्रार करू शकतो.",
              "ऑर्डरचे रेटिंग आणि टिप्पण्या फक्त दुकानाला दिसतात. तुम्हाला मदत करण्यासाठी चॅट संदेश दुकानाचे कर्मचारी वाचतात आणि ठेवतात.",
              "रिव्ह्यू लिहून तुम्ही तो या साइटवर दाखवण्याची परवानगी आम्हाला देता.",
            ],
          },
        ],
      },
      {
        id: "fair-use",
        title: "साइटचा योग्य वापर",
        blocks: [
          "साइटचा गैरवापर करू नका: तिची सुरक्षा भेदण्याचे प्रयत्न, स्वयंचलित नक्कल, खोट्या ऑर्डर, दुसऱ्याचे सोंग घेणे, किंवा कर्मचारी व डिलिव्हरी भागीदारांशी अपमानास्पद भाषा नको. दुकानाचे कर्मचारी आणि डिलिव्हरी भागीदार ग्राहकांचे तपशील फक्त दुकानाच्या कामासाठी वापरू शकतात.",
        ],
      },
      {
        id: "liability",
        title: "आमची जबाबदारी",
        blocks: [
          "उत्पादनांचे योग्य वर्णन करण्याची आणि वेळेवर पोहोचवण्याची आम्ही वाजवी काळजी घेतो. आम्ही या अटी मोडल्यास, ऑर्डरच्या वेळी तुम्हाला वाजवीपणे अपेक्षित असलेल्या नुकसानासाठी, त्या ऑर्डरच्या किमतीपर्यंत, आम्ही जबाबदार आहोत. तीव्र हवामान, संप किंवा नेटवर्क बिघाड अशा आमच्या नियंत्रणाबाहेरील घटनांमुळे होणाऱ्या उशिरासाठी आम्ही जबाबदार नाही.",
          "कायदा ज्यावर मर्यादा घालू देत नाही, त्यावर या अटी मर्यादा घालत नाहीत, ग्राहक म्हणून तुमच्या अधिकारांसह.",
        ],
      },
      {
        id: "disputes",
        title: "वाद आणि अंतिम निर्णय",
        blocks: [
          "ऑर्डर, परत करणे, पैसे परत, ऑफर किंवा इतर कशाबद्दलही तुम्ही नाखूष असल्यास, आधी [दुकानाशी बोला](/account/support) मधून किंवा [संपर्क व तक्रार निवारण](/p/contact-and-grievance) वरील आमच्या तक्रार निवारण अधिकाऱ्याशी संपर्क साधा. आम्ही 48 तासांत तक्रारीची पोच देतो आणि एका महिन्यात ती सोडवण्याचा प्रयत्न करतो.",
          `**या अटी आणि आमची धोरणे कशी लागू होतात यासह प्रत्येक वादाचा आढावा ${f.business.legalName} घेते, आणि दुकानाच्या स्वतःच्या प्रक्रियेत तिचा निर्णय अंतिम असतो.**`,
          "**वेबसाइटवरील आवृत्ती लागू होते.** तुम्ही ऑर्डर दिली तेव्हा या वेबसाइटवर प्रसिद्ध असलेल्या अटी व धोरणे त्या ऑर्डरला लागू होतात. पत्रके, संदेश, फोन किंवा इतर प्रतींमध्ये सांगितलेल्या कोणत्याही गोष्टीपेक्षा त्या वरचढ ठरतात. इंग्रजी आणि मराठी आवृत्त्यांमध्ये फरक असल्यास इंग्रजी आवृत्ती ग्राह्य धरली जाईल.",
          "या अटींना भारताचे कायदे लागू आहेत. खालील तुमच्या अधिकारांच्या अधीन राहून, रायगड, महाराष्ट्र येथील न्यायालयांना अधिकारक्षेत्र आहे.",
          "या विभागातील काहीही ग्राहक संरक्षण कायदा, 2019 अंतर्गत तुमचे अधिकार काढून घेत नाही. तुम्ही तरीही राष्ट्रीय ग्राहक हेल्पलाइनशी (1915, [consumerhelpline.gov.in](https://consumerhelpline.gov.in)) संपर्क साधू शकता किंवा ग्राहक आयोगाकडे, [e-Daakhil](https://edaakhil.nic.in) वरून ऑनलाइनसुद्धा, तक्रार दाखल करू शकता.",
        ],
      },
      {
        id: "changes",
        title: "या अटींमधील बदल",
        blocks: [
          "आम्ही या अटी बदलू शकतो. आवृत्ती आणि तारीख या पानाच्या वर आहेत. ऑर्डर देताना तुम्ही चेकआउटवर दाखवलेली आवृत्ती मान्य करता; ती तुमच्या ऑर्डरसोबत साठवली जाते आणि त्या ऑर्डरला लागू होते.",
        ],
      },
    ],
  }),
};
