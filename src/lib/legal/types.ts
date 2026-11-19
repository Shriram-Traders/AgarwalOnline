
/**
 * A paragraph, a bulleted list, or label/value rows. Inside any text, `[label](/href)` is a link
 * and `**words**` is bold; the page renders both, nothing else.
 */
export type Block = string | { list: string[] } | { rows: [string, string][] };
export type LegalSection = { id: string; title: string; blocks: Block[] };
export type LegalDoc = { title: string; lead: string; sections: LegalSection[] };

export type LegalArea = {
  name: string;
  feePaise: number;
  codEnabled: boolean;
  codLimitPaise: number;
  /** The area's weekly delivery windows, e.g. days [1..6] at "10:00 AM – 1:00 PM". */
  times: { days: number[]; window: string }[];
};

/** What the policies quote from Store settings, so they never promise something the shop has changed. */
export type LegalFacts = {
  business: {
    legalName: string;
    address: string;
    gstin?: string;
    phone?: string;
    email?: string;
    grievanceName?: string;
    grievanceDesignation?: string;
  };
  /** Same-day cutoff, "3:00 PM". */
  cutoff: string;
  freeThresholdPaise: number;
  /** Weekdays with no deliveries, 0 = Sunday. */
  holidays: number[];
  /** Upcoming dates with no deliveries, YYYY-MM-DD. */
  blackoutDates: string[];
  areas: LegalArea[];
  evidenceDays: number;
  auditDays: number;
  /** Customers can pay at the door by UPI (the shop has a UPI ID in Settings): riders show a QR code. */
  upiAtDoor: boolean;
};

/** The site is English only (2026-11-12): each policy has one text. */
export type LegalBuilder = { en: (facts: LegalFacts) => LegalDoc };
