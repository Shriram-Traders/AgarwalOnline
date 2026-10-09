import type { Locale } from "../locale-types";

export type NoticeKind =
  | "signin"
  | "signup"
  | "address"
  | "complaint"
  | "evidence"
  | "review"
  | "feedback"
  | "chat"
  | "handoff"
  | "school-join"
  | "school-quote"
  | "school-accept"
  | "rider"
  | "staff";

type Vars = { days?: number; google?: boolean };

const PRIVACY = { en: "[Privacy Policy](/p/privacy-policy)", mr: "[गोपनीयता धोरण](/p/privacy-policy)" };
const TERMS = { en: "[Terms & Conditions](/p/terms-and-conditions)", mr: "[अटी व शर्ती](/p/terms-and-conditions)" };

/**
 * The one line under each form that says how what you send is used, with links to the policies.
 * Same `[label](/href)` format as the policy pages. Pure data: client forms import it.
 */
const NOTICES: Record<Locale, Record<NoticeKind, (vars: Vars) => string>> = {
  en: {
    signin: ({ google }) =>
      `By signing in${google ? " or continuing with Google" : ""}, you agree to our ${TERMS.en} and ${PRIVACY.en}.`,
    signup: ({ google }) =>
      `By creating an account${google ? " or continuing with Google" : ""}, you agree to our ${TERMS.en} and ${PRIVACY.en}.`,
    address: () =>
      `We use this name, number and address only to deliver your orders, and your delivery partner sees them. See our ${PRIVACY.en}.`,
    complaint: () =>
      `The store team reads this to sort it out. See how [returns and refunds](/p/refunds-and-cancellations) work and our ${PRIVACY.en}.`,
    evidence: ({ days = 90 }) =>
      `Only the store team sees these photos, and they’re deleted after ${days} days. See our ${PRIVACY.en}.`,
    review: () =>
      `Your review is shown publicly with your account name. Reviews that break our [Terms & Conditions](/p/terms-and-conditions#reviews) may be hidden. See our ${PRIVACY.en}.`,
    feedback: () => `Only the shop sees your rating and comment. See our ${PRIVACY.en}.`,
    chat: () =>
      `Store staff read and keep these chats to help you. Never share passwords, sign-in codes or card details. See our ${PRIVACY.en}.`,
    handoff: () => `Store staff will see your question. See our ${PRIVACY.en}.`,
    "school-join": () =>
      `The store sees your name, phone number and this message to check your request. See our ${PRIVACY.en}.`,
    "school-quote": () =>
      "Quotations follow our [Terms & Conditions](/p/terms-and-conditions#schools); nothing is binding until you accept one.",
    "school-accept": () => "Accepting places an order under our [Terms & Conditions](/p/terms-and-conditions#schools).",
    rider: () => `Use this customer’s phone number and address only for this delivery. See our ${PRIVACY.en}.`,
    staff: () => `Staff may use customers’ details only for store work. See our ${PRIVACY.en}.`,
  },
  mr: {
    signin: ({ google }) =>
      `साइन इन करून${google ? " किंवा Google ने पुढे जाऊन" : ""} तुम्ही आमच्या ${TERMS.mr} आणि ${PRIVACY.mr} ला संमती देता.`,
    signup: ({ google }) =>
      `खाते तयार करून${google ? " किंवा Google ने पुढे जाऊन" : ""} तुम्ही आमच्या ${TERMS.mr} आणि ${PRIVACY.mr} ला संमती देता.`,
    address: () =>
      `हे नाव, नंबर आणि पत्ता आम्ही फक्त तुमच्या ऑर्डर पोहोचवण्यासाठी वापरतो, आणि ते तुमच्या डिलिव्हरी भागीदाराला दिसतात. आमचे ${PRIVACY.mr} पाहा.`,
    complaint: () =>
      `हे सोडवण्यासाठी दुकानाचे कर्मचारी ते वाचतात. [परत करणे व पैसे परत](/p/refunds-and-cancellations) कसे होते आणि आमचे ${PRIVACY.mr} पाहा.`,
    evidence: ({ days = 90 }) =>
      `हे फोटो फक्त दुकानाच्या कर्मचाऱ्यांना दिसतात, आणि ${days} दिवसांनी हटवले जातात. आमचे ${PRIVACY.mr} पाहा.`,
    review: () =>
      `तुमचा रिव्ह्यू तुमच्या खात्याच्या नावासह सर्वांना दिसतो. आमच्या [अटी व शर्ती](/p/terms-and-conditions#reviews) मोडणारे रिव्ह्यू लपवले जाऊ शकतात. आमचे ${PRIVACY.mr} पाहा.`,
    feedback: () => `तुमचे रेटिंग आणि टिप्पणी फक्त दुकानाला दिसते. आमचे ${PRIVACY.mr} पाहा.`,
    chat: () =>
      `तुम्हाला मदत करण्यासाठी दुकानाचे कर्मचारी हे चॅट वाचतात आणि ठेवतात. पासवर्ड, साइन-इन कोड किंवा कार्डचा तपशील कधीही देऊ नका. आमचे ${PRIVACY.mr} पाहा.`,
    handoff: () => `तुमचा प्रश्न दुकानाच्या कर्मचाऱ्यांना दिसेल. आमचे ${PRIVACY.mr} पाहा.`,
    "school-join": () =>
      `तुमची विनंती तपासण्यासाठी दुकानाला तुमचे नाव, फोन नंबर आणि हा संदेश दिसतो. आमचे ${PRIVACY.mr} पाहा.`,
    "school-quote": () =>
      "कोटेशन आमच्या [अटी व शर्ती](/p/terms-and-conditions#schools) नुसार असतात; तुम्ही ते स्वीकारेपर्यंत काहीही बंधनकारक नाही.",
    "school-accept": () => "स्वीकारल्याने आमच्या [अटी व शर्ती](/p/terms-and-conditions#schools) नुसार ऑर्डर दिली जाते.",
    rider: () => `या ग्राहकाचा फोन नंबर आणि पत्ता फक्त या डिलिव्हरीसाठी वापरा. आमचे ${PRIVACY.mr} पाहा.`,
    staff: () => `कर्मचारी ग्राहकांचे तपशील फक्त दुकानाच्या कामासाठी वापरू शकतात. आमचे ${PRIVACY.mr} पाहा.`,
  },
};

export const notice = (kind: NoticeKind, locale: Locale = "en", vars: Vars = {}) => NOTICES[locale][kind](vars);
