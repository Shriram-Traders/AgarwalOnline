import type { Locale } from "../locale-types";
import type { Topic } from "./types";

/** Everything the shop assistant says, in both languages. Pure data, so the chat can use it too. */
export const assistantCopy = {
  en: {
    launcher: "Ask the shop assistant",
    title: "Agarwal assistant",
    subtitle: "Ask in English or मराठी",
    close: "Close the assistant",
    startOver: "Start over",
    placeholder: "Ask anything, or type what you need",
    send: "Send",
    thinking: "Looking that up…",
    you: "You",
    greeting:
      "Namaste! Ask about delivery, your orders or returns, or type what you're looking for, like “gel pens” or “A4 register”.",
    topics: {
      order: "Track my order",
      delivery: "Delivery areas and times",
      payment: "Payment",
      returns: "Returns and complaints",
      school: "School orders",
      human: "Talk to the store",
    } satisfies Record<Topic, string>,
    deliveryAreas: (areas: string, cutoff: string) =>
      `We deliver same day to ${areas}. Order before ${cutoff} for delivery today; later orders come on the next delivery day.`,
    deliveryNoAreas: "We're still setting up our delivery areas. Check your PIN code, or ask the store.",
    deliveryClosed: (days: string) => `We don't deliver on ${days}.`,
    deliveryFees: (free: string, fee: string) =>
      `Delivery is free on orders of ${free} or more; otherwise it starts at ${fee}.`,
    deliveryPinHint: "Type your 6-digit PIN code and I'll check it.",
    checkPin: "Check your PIN code",
    pinYes: (pin: string, area: string, fee: string, free: string) =>
      `Yes, we deliver to ${pin} (${area}). Delivery is ${fee}, and free on orders of ${free} or more.`,
    pinNo: (pin: string) => `Not yet: we don't deliver to ${pin} right now.`,
    pinNoAreas: (areas: string) => `We deliver to ${areas}.`,
    payment: (online: boolean): string =>
      online
        ? "You can pay cash on delivery, or online by UPI, card or net banking. Checkout shows the options for your address."
        : "You can pay cash on delivery. Checkout shows what's available for your address.",
    orderSignIn: "Sign in to see your orders and where they are.",
    orderNone: "You haven't placed an order yet.",
    orderList: "Your latest orders:",
    orderHelp: "Need help with one of them? The store team can check.",
    returns:
      "If something in a delivered order is missing, damaged or wrong, report it from Complaints and returns, with a photo if you can. The store replies there. Other questions can be asked anytime.",
    returnsLink: "Complaints and returns",
    returnsSignIn: "Sign in to report a problem with an order.",
    school:
      "Schools buying in bulk get their own catalogue and quotations with GST. Ask your school for its join link from the store, or ask the store to add you.",
    schoolLink: "Open the school area",
    humanSignIn: "Sign in to chat with the store team. They reply in the live chat on your account.",
    handoff: "I'll pass you to the store team. They reply in the live chat, and you'll get a notification.",
    handoffButton: "Chat with the store",
    handoffTitle: "Question from the shop assistant",
    signIn: "Sign in",
    signUp: "Create an account",
    found: "Here's what I found:",
    seeAll: "See all results",
    notFound: (q: string) => `I couldn't find “${q}”. Try another word, or ask the store.`,
    tooShort: "Tell me a little more, like “blue pens” or “gift wrap”.",
    thanks: "You're welcome! Anything else?",
    tooFast: "That's a lot of questions at once. Wait a moment and try again.",
    error: "I couldn't answer that just now. Try again, or talk to the store.",
    offline: "Couldn't reach the store. Check your connection and try again.",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    and: "and",
  },
  mr: {
    launcher: "दुकानाच्या सहाय्यकाला विचारा",
    title: "अग्रवाल सहाय्यक",
    subtitle: "मराठी किंवा English मध्ये विचारा",
    close: "सहाय्यक बंद करा",
    startOver: "पुन्हा सुरू करा",
    placeholder: "काहीही विचारा, किंवा हवी ती वस्तू लिहा",
    send: "पाठवा",
    thinking: "शोधत आहे…",
    you: "तुम्ही",
    greeting:
      "नमस्कार! वितरण, तुमच्या ऑर्डर किंवा परतावा याबद्दल विचारा, किंवा हवी ती वस्तू लिहा, जसे “जेल पेन” किंवा “A4 रजिस्टर”.",
    topics: {
      order: "माझी ऑर्डर कुठे आहे",
      delivery: "वितरण क्षेत्र आणि वेळ",
      payment: "पेमेंट",
      returns: "परतावा आणि तक्रारी",
      school: "शाळेच्या ऑर्डर",
      human: "दुकानाशी बोला",
    } satisfies Record<Topic, string>,
    deliveryAreas: (areas: string, cutoff: string) =>
      `आम्ही ${areas} येथे त्याच दिवशी वितरण करतो. आज वितरणासाठी ${cutoff} पूर्वी ऑर्डर द्या; नंतरच्या ऑर्डर पुढच्या वितरण दिवशी येतात.`,
    deliveryNoAreas: "आमची वितरण क्षेत्रे अजून ठरत आहेत. तुमचा पिन कोड तपासा, किंवा दुकानाला विचारा.",
    deliveryClosed: (days: string) => `${days} रोजी वितरण नसते.`,
    deliveryFees: (free: string, fee: string) =>
      `${free} किंवा अधिकच्या ऑर्डरवर वितरण मोफत; अन्यथा ${fee} पासून.`,
    deliveryPinHint: "तुमचा ६ अंकी पिन कोड लिहा, मी तपासतो.",
    checkPin: "पिन कोड तपासा",
    pinYes: (pin: string, area: string, fee: string, free: string) =>
      `हो, आम्ही ${pin} (${area}) येथे वितरण करतो. वितरण शुल्क ${fee}, आणि ${free} किंवा अधिकच्या ऑर्डरवर मोफत.`,
    pinNo: (pin: string) => `अजून नाही: सध्या ${pin} येथे वितरण होत नाही.`,
    pinNoAreas: (areas: string) => `आम्ही ${areas} येथे वितरण करतो.`,
    payment: (online: boolean): string =>
      online
        ? "तुम्ही डिलिव्हरीवेळी रोख, किंवा UPI, कार्ड किंवा नेट बँकिंगने ऑनलाइन पैसे देऊ शकता. चेकआउटमध्ये तुमच्या पत्त्यासाठीचे पर्याय दिसतात."
        : "तुम्ही डिलिव्हरीवेळी रोख पैसे देऊ शकता. चेकआउटमध्ये तुमच्या पत्त्यासाठीचे पर्याय दिसतात.",
    orderSignIn: "तुमच्या ऑर्डर आणि त्या कुठे आहेत हे पाहण्यासाठी साइन इन करा.",
    orderNone: "तुम्ही अजून ऑर्डर दिलेली नाही.",
    orderList: "तुमच्या अलीकडच्या ऑर्डर:",
    orderHelp: "यापैकी एखाद्या ऑर्डरबद्दल मदत हवी? दुकानाची टीम तपासू शकते.",
    returns:
      "वितरित ऑर्डरमधील वस्तू कमी, खराब किंवा चुकीची असल्यास ‘तक्रारी आणि परतावा’ मधून कळवा, शक्य असल्यास फोटोसह. दुकान तिथेच उत्तर देते. इतर प्रश्न केव्हाही विचारता येतात.",
    returnsLink: "तक्रारी आणि परतावा",
    returnsSignIn: "ऑर्डरमधील अडचण कळवण्यासाठी साइन इन करा.",
    school:
      "मोठ्या प्रमाणात खरेदी करणाऱ्या शाळांना स्वतःचा कॅटलॉग आणि GST सह कोटेशन मिळते. दुकानाकडून तुमच्या शाळेची जोडणी लिंक मागा, किंवा दुकानाला तुम्हाला जोडायला सांगा.",
    schoolLink: "शाळेचा विभाग उघडा",
    humanSignIn: "दुकानाच्या टीमशी चॅट करण्यासाठी साइन इन करा. ते तुमच्या खात्यातील लाइव्ह चॅटमध्ये उत्तर देतात.",
    handoff: "मी तुम्हाला दुकानाच्या टीमकडे पाठवतो. ते लाइव्ह चॅटमध्ये उत्तर देतील, आणि तुम्हाला सूचना मिळेल.",
    handoffButton: "दुकानाशी चॅट करा",
    handoffTitle: "दुकानाच्या सहाय्यकाकडून प्रश्न",
    signIn: "साइन इन",
    signUp: "खाते तयार करा",
    found: "हे सापडले:",
    seeAll: "सर्व निकाल पाहा",
    notFound: (q: string) => `“${q}” सापडले नाही. दुसरा शब्द वापरून पाहा, किंवा दुकानाला विचारा.`,
    tooShort: "थोडे अधिक सांगा, जसे “निळे पेन” किंवा “गिफ्ट रॅप”.",
    thanks: "आनंद झाला! आणखी काही?",
    tooFast: "एकाच वेळी खूप प्रश्न आले. थोडे थांबून पुन्हा प्रयत्न करा.",
    error: "आत्ता उत्तर देता आले नाही. पुन्हा प्रयत्न करा, किंवा दुकानाशी बोला.",
    offline: "दुकानाशी संपर्क झाला नाही. इंटरनेट तपासून पुन्हा प्रयत्न करा.",
    days: ["रविवार", "सोमवार", "मंगळवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
    and: "आणि",
  },
} satisfies Record<Locale, unknown>;

export type AssistantCopy = (typeof assistantCopy)["en"];

/** "A, B and C" in the chosen language. */
export const joinList = (items: string[], and: string) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
