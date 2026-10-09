import type { Locale } from "../locale-types";

export type LegalKey = "privacy" | "terms" | "refunds" | "shipping" | "contact";

/** The policies' own section, /p: a home page listing them all, each policy under it. */
export const POLICIES_HOME = { href: "/p", title: { en: "Store policies", mr: "दुकानाची धोरणे" } } as const;

/**
 * The five policy pages, in reading order (the footer, the switcher and Previous/Next follow it).
 * Each address is its title spelled out: /p/privacy-policy. Tiny on purpose: client forms import
 * it for their notices. The short addresses (/privacy, /terms…) forward here, see `next.config.ts`.
 */
export const LEGAL_PAGES: { key: LegalKey; href: string; title: Record<Locale, string> }[] = [
  { key: "privacy", href: "/p/privacy-policy", title: { en: "Privacy Policy", mr: "गोपनीयता धोरण" } },
  { key: "terms", href: "/p/terms-and-conditions", title: { en: "Terms & Conditions", mr: "अटी व शर्ती" } },
  {
    key: "refunds",
    href: "/p/refunds-and-cancellations",
    title: { en: "Refunds & Cancellations", mr: "रद्द करणे व पैसे परत" },
  },
  { key: "shipping", href: "/p/shipping-and-delivery", title: { en: "Shipping & Delivery", mr: "शिपिंग व वितरण" } },
  { key: "contact", href: "/p/contact-and-grievance", title: { en: "Contact & Grievance", mr: "संपर्क व तक्रार निवारण" } },
];

export const legalPage = (key: LegalKey) => LEGAL_PAGES.find((page) => page.key === key)!;
