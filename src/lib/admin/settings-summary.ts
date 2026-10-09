import { formatPrice } from "@/lib/display";

export type HubCard = {
  id: string;
  title: string;
  /** The section or panel on the settings page it opens. */
  href: `#${string}`;
  edit: string;
  lines: string[];
  warnings: string[];
};

type HubInput = {
  rules: { cutoffHour: number; freeThresholdPaise: number; blackoutDates: string[]; holidays: number[] };
  areas: { name: string; enabled: boolean; pincodes: string[]; feePaise: number; codEnabled: boolean; codLimitPaise: number }[];
  patterns: { enabled: boolean }[];
  upcoming: { enabled: boolean; reserved: number; capacity: number }[];
  /** Areas with nothing bookable over the next open days. */
  gapAreas: string[];
  business: { legalName: string; gstin?: string | null; stateName?: string; grievanceName?: string | null };
  stockThreshold: number;
  synonymGroups: number;
  services: { payments: boolean; photos: boolean; sms: boolean };
  /** IST date, YYYY-MM-DD. */
  today: string;
  weekdays: readonly string[];
  daysAhead: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const clock = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

/**
 * The cards at the top of Store settings: each area in a sentence or two, with anything that
 * stops shoppers checking out called out. Built from what the page already loads.
 */
export function settingsHub(input: HubInput): HubCard[] {
  const { rules, areas, patterns, upcoming } = input;
  const live = areas.filter((area) => area.enabled);
  const closedAhead = rules.blackoutDates.filter((date) => date >= input.today).length;
  const fees = live.map((area) => area.feePaise);
  const cod = live.filter((area) => area.codEnabled);
  const paused = patterns.filter((pattern) => !pattern.enabled).length;
  const open = upcoming.filter((slot) => slot.enabled);
  const full = open.filter((slot) => slot.reserved >= slot.capacity).length;
  return [
    {
      id: "delivery-rules",
      title: "Delivery rules",
      href: "#delivery-rules",
      edit: "Change rules",
      lines: [
        `Same day if ordered before ${clock(rules.cutoffHour)}`,
        `Free delivery from ${formatPrice(rules.freeThresholdPaise)}`,
        rules.holidays.length
          ? `Closed every ${list(rules.holidays.map((day) => input.weekdays[day]))}`
          : "Open every day of the week",
        ...(closedAhead ? [`${plural(closedAhead, "closed date")} coming up`] : []),
      ],
      warnings: [],
    },
    {
      id: "weekly",
      title: "Delivery times",
      href: "#weekly",
      edit: "Change times",
      lines: [
        patterns.length ? plural(patterns.length, "weekly delivery time") : "No weekly delivery times yet",
        ...(paused ? [`${paused} paused`] : []),
        `${plural(open.length, "slot")} open over the next ${input.daysAhead} days${full ? `, ${full} full` : ""}`,
      ],
      warnings: input.gapAreas.length
        ? [`Nothing to book in ${list(input.gapAreas)}, so shoppers there can’t check out`]
        : [],
    },
    {
      id: "areas",
      title: "Service areas",
      href: "#areas",
      edit: "Change areas",
      lines: [
        `${live.length} of ${plural(areas.length, "area")} switched on`,
        `${plural(live.reduce((sum, area) => sum + area.pincodes.length, 0), "PIN code")} served`,
        ...(fees.length
          ? [
              Math.min(...fees) === Math.max(...fees)
                ? `Delivery fee ${formatPrice(fees[0])}`
                : `Delivery fee ${formatPrice(Math.min(...fees))} to ${formatPrice(Math.max(...fees))}`,
            ]
          : []),
        ...(live.length
          ? [cod.length ? `Cash on delivery in ${plural(cod.length, "area")}` : "No cash on delivery"]
          : []),
      ],
      warnings: live.length ? [] : ["No area is switched on, so checkout can’t deliver anywhere"],
    },
    {
      id: "tax",
      title: "Business and tax",
      href: "#tax",
      edit: input.business.gstin ? "Change details" : "Add GSTIN",
      lines: [input.business.legalName, ...(input.business.stateName ? [input.business.stateName] : [])],
      warnings: [
        ...(input.business.gstin ? [] : ["No GSTIN yet; quotations say it will be added"]),
        ...(input.business.grievanceName ? [] : ["No grievance officer yet; the Contact page says it’s being added"]),
      ],
    },
    {
      id: "stock-approval",
      title: "Approval checks",
      href: "#stock-approval",
      edit: "Change limit",
      lines: [`Stock changes of ${plural(input.stockThreshold, "unit")} or more wait for a second owner`],
      warnings: [],
    },
    {
      id: "synonyms",
      title: "Search words",
      href: "#synonyms",
      edit: "Add words",
      lines: [
        input.synonymGroups
          ? `${plural(input.synonymGroups, "group")} of words that mean the same`
          : "Only the built-in words, like vahi for notebook",
      ],
      warnings: [],
    },
    {
      id: "services",
      title: "Connected services",
      href: "#services",
      edit: "See status",
      lines: [
        input.services.payments ? "Online payment connected" : "Online payment not set up: cash on delivery only",
        input.services.sms ? "SMS connected" : "SMS: test codes only",
        input.services.photos ? "Photo storage connected" : "Photos stored locally",
      ],
      warnings: [],
    },
  ];
}
