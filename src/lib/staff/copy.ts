import type { Locale } from "../locale-types";
import type { StaffGroupKey, StaffNavKey } from "./nav";

/**
 * Words for the staff header, menu, tabs and search, in both languages. Kept apart from the shop's
 * `copy` so shoppers don't download them. Page bodies are English for now.
 */
type StaffCopy = {
  workspace: string;
  home: string;
  viewShop: string;
  alerts: (n: number) => string;
  waiting: (n: number) => string;
  runningLow: (n: number) => string;
  navLabel: string;
  showGroup: (group: string) => string;
  groups: Record<StaffGroupKey, string>;
  nav: Record<StaffNavKey, string>;
  tabs: {
    label: string;
    overview: string;
    orders: string;
    search: string;
    chats: string;
    more: string;
    deliveries: string;
    account: string;
  };
  search: {
    label: string;
    placeholder: string;
    groups: Record<"record" | "setting" | "action" | "page" | "goto", string>;
    ordersMatching: (q: string) => string;
    customersMatching: (q: string) => string;
    ordersHint: string;
    customersHint: string;
    empty: (q: string) => string;
    count: (n: number) => string;
    keys: string;
    clear: string;
  };
  sheet: { more: string; close: string; account: string; language: string };
};

export const staffCopy: Record<Locale, StaffCopy> = {
  en: {
    workspace: "Store workspace",
    home: "Agarwal General Stores, store workspace",
    viewShop: "View shop",
    alerts: (n) => (n ? `${n} ${n === 1 ? "thing needs" : "things need"} you` : "Nothing needs you right now"),
    waiting: (n) => `${n} waiting`,
    runningLow: (n) => `${n} running low`,
    navLabel: "Staff workspace",
    showGroup: (group) => `Show or hide ${group}`,
    groups: {
      today: "Today",
      products: "Products",
      customers: "Customers",
      money: "Money",
      schools: "Schools",
      setup: "Setup",
      delivery: "Delivery",
    },
    nav: {
      overview: "Overview & orders",
      chats: "Support chats",
      complaints: "Complaints & returns",
      catalog: "Catalog & stock",
      customers: "Customers",
      reviews: "Reviews",
      cod: "Cash on delivery",
      tabs: "Family tabs",
      refunds: "Refunds",
      offers: "Offers",
      analytics: "Analytics",
      schools: "Schools",
      quotations: "Quotations",
      settings: "Store settings",
      staff: "Staff & roles",
      approvals: "Approvals",
      audit: "Audit trail",
      deliveries: "My deliveries",
    },
    tabs: {
      label: "Workspace tabs",
      overview: "Overview",
      orders: "Orders",
      search: "Search",
      chats: "Chats",
      more: "More",
      deliveries: "Deliveries",
      account: "Account",
    },
    search: {
      label: "Search the workspace",
      placeholder: "Search settings, pages, orders",
      groups: {
        record: "Orders and customers",
        setting: "Settings",
        action: "Actions",
        page: "Pages",
        goto: "Go to",
      },
      ordersMatching: (q) => `Orders matching “${q}”`,
      customersMatching: (q) => `Customers matching “${q}”`,
      ordersHint: "Overview › Orders",
      customersHint: "Customers",
      empty: (q) => `No setting or page called “${q}”. Try another word, like “delivery fee” or “GST”.`,
      count: (n) => (n === 1 ? "1 result" : `${n} results`),
      keys: "↑ ↓ move · Enter open · Esc close",
      clear: "Clear search",
    },
    sheet: { more: "Workspace menu", close: "Close", account: "My account", language: "Language" },
  },
  mr: {
    workspace: "दुकानाचे काम",
    home: "अग्रवाल जनरल स्टोअर्स, दुकानाचे काम",
    viewShop: "दुकान पाहा",
    alerts: (n) => (n ? `${n} कामे तुमची वाट पाहत आहेत` : "आत्ता काहीही बाकी नाही"),
    waiting: (n) => `${n} बाकी`,
    runningLow: (n) => `${n} कमी स्टॉक`,
    navLabel: "दुकानाच्या कामाचा मेनू",
    showGroup: (group) => `${group} दाखवा किंवा लपवा`,
    groups: {
      today: "आज",
      products: "उत्पादने",
      customers: "ग्राहक",
      money: "पैसे",
      schools: "शाळा",
      setup: "सेटअप",
      delivery: "वितरण",
    },
    nav: {
      overview: "आढावा व ऑर्डर",
      chats: "सपोर्ट चॅट",
      complaints: "तक्रारी व रिटर्न",
      catalog: "उत्पादने व स्टॉक",
      customers: "ग्राहक",
      reviews: "परीक्षणे",
      cod: "कॅश ऑन डिलिव्हरी",
      tabs: "कुटुंब खाते",
      refunds: "रिफंड",
      offers: "ऑफर",
      analytics: "आकडेवारी",
      schools: "शाळा",
      quotations: "कोटेशन",
      settings: "दुकानाची सेटिंग्ज",
      staff: "कर्मचारी व भूमिका",
      approvals: "मंजुरी",
      audit: "बदलांची नोंद",
      deliveries: "माझ्या डिलिव्हरी",
    },
    tabs: {
      label: "कामाचे टॅब",
      overview: "आढावा",
      orders: "ऑर्डर",
      search: "शोधा",
      chats: "चॅट",
      more: "अधिक",
      deliveries: "डिलिव्हरी",
      account: "खाते",
    },
    search: {
      label: "कामात शोधा",
      placeholder: "सेटिंग्ज, पाने, ऑर्डर शोधा",
      groups: {
        record: "ऑर्डर व ग्राहक",
        setting: "सेटिंग्ज",
        action: "कामे",
        page: "पाने",
        goto: "थेट जा",
      },
      ordersMatching: (q) => `“${q}” शी जुळणाऱ्या ऑर्डर`,
      customersMatching: (q) => `“${q}” शी जुळणारे ग्राहक`,
      ordersHint: "आढावा › ऑर्डर",
      customersHint: "ग्राहक",
      empty: (q) => `“${q}” नावाची सेटिंग किंवा पान नाही. “वितरण शुल्क” किंवा “GST” असा दुसरा शब्द वापरून पाहा.`,
      count: (n) => `${n} निकाल`,
      keys: "↑ ↓ निवडा · Enter उघडा · Esc बंद",
      clear: "शोध पुसा",
    },
    sheet: { more: "कामाचा मेनू", close: "बंद करा", account: "माझे खाते", language: "भाषा" },
  },
};
