import type { Locale } from "../locale-types";

/** Words for the school marketplace's header and tab bar. Its pages are in English for now. */
const en = {
  forSchools: "For schools",
  home: "Agarwal General Stores for schools, school home",
  navLabel: "School navigation",
  aislesLabel: "School aisles",
  allItems: "All school items",
  quotations: "Quotations",
  shopForHome: "Shop for home",
  searchLabel: "Search school supplies",
  searchPlaceholder: "Search school supplies",
  searchHints: ["registers", "answer sheets", "long books", "chalk", "drawing books"],
  basket: "Basket",
  basketCount: (n: number) => (n === 1 ? "Basket, 1 item" : `Basket, ${n} items`),
  tabHome: "Home",
  tabAisles: "Aisles",
  tabYou: "You",
  switchSchool: "Switch school",
  schoolLabel: (name: string) => `Buying for ${name}`,
  forMySchool: "For my school",
};

export const schoolCopy: Record<Locale, typeof en> = {
  en,
  mr: {
    forSchools: "शाळांसाठी",
    home: "अग्रवाल जनरल स्टोअर्स शाळांसाठी, शाळेचे मुख्य पान",
    navLabel: "शाळेचा मेनू",
    aislesLabel: "शाळेचे विभाग",
    allItems: "सर्व शालेय वस्तू",
    quotations: "कोटेशन",
    shopForHome: "घरासाठी खरेदी",
    searchLabel: "शाळेचे साहित्य शोधा",
    searchPlaceholder: "शाळेचे साहित्य शोधा",
    searchHints: ["रजिस्टर", "उत्तरपत्रिका", "लांब वह्या", "खडू", "चित्रकला वह्या"],
    basket: "बास्केट",
    basketCount: (n: number) => `बास्केट, ${n} वस्तू`,
    tabHome: "मुख्य",
    tabAisles: "विभाग",
    tabYou: "तुम्ही",
    switchSchool: "शाळा बदला",
    schoolLabel: (name: string) => `${name} साठी खरेदी`,
    forMySchool: "माझ्या शाळेसाठी",
  },
};
