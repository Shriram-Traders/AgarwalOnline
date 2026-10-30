import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { SystemSetting } from "../commerce/models";
import { assertPermission, type Role } from "../auth/permissions";
import { shared } from "../db/shop-cache";
import { paiseFromRupees } from "../display";

/**
 * Customize (/super-admin/customize): how the bills, packing slips and quotations look, the shop
 * front's words, customer messages, numbering, staff form defaults and the work queue's timings.
 * Each section is one SystemSetting (`shop-<section>`) described once below: the description is
 * the validation, the form reading, the defaults and the labels on the page. Every field has a
 * default that matches how the shop worked before the setting existed, so nothing changes until an
 * owner changes it, and a stored value that no longer fits falls back to the default on its own.
 */

type Choice = { readonly value: string; readonly label: string };
type Base = {
  readonly label: string;
  readonly hint?: string;
  /** Starts a new block of fields on the page, under this heading. */
  readonly group?: string;
  /** Shown in an empty box: what is used when it's left blank. */
  readonly placeholder?: string;
};
export type FieldSpec = Base &
  (
    | { readonly kind: "check"; readonly default: boolean }
    | {
        readonly kind: "text";
        readonly default: string;
        readonly max: number;
        /** Required, at least this long. */
        readonly min?: number;
        readonly pattern?: RegExp;
        readonly patternMessage?: string;
        readonly long?: boolean;
        readonly upper?: boolean;
      }
    /** English and Marathi; left blank, the shop's own wording shows. */
    | {
        readonly kind: "both";
        readonly max: number;
        readonly long?: boolean;
        /** The shop's own words, used while the owner leaves a box blank. */
        readonly own?: { readonly en: string; readonly mr: string };
      }
    | { readonly kind: "choice"; readonly default: string; readonly options: readonly Choice[] }
    | { readonly kind: "number"; readonly default: number; readonly min: number; readonly max: number }
    /** Stored in paise, typed in rupees (the form field is `<name>Rupees`). */
    | { readonly kind: "money"; readonly default: number; readonly max: number }
    /** Minutes, picked from a list. */
    | { readonly kind: "duration"; readonly default: number }
    | { readonly kind: "colour"; readonly default: string }
  );

export const PAPERS = [
  { value: "a4", label: "A4 page" },
  { value: "a5", label: "A5 (half an A4 page)" },
  { value: "receipt", label: "80 mm receipt printer" },
] as const;
/** How a bill is laid out: today's open layout, or one of the classic boxed ones (src/lib/documents/invoice-boxed.ts). */
export const BILL_STYLES = [
  { value: "modern", label: "Modern, as now" },
  { value: "ledger", label: "Parchment ledger (boxed, khaki paper)" },
  { value: "bilingual", label: "Marathi and English (boxed)" },
  { value: "shree", label: "Shree festive (boxed, ॥ श्री ॥ and a toran)" },
] as const;
export const DURATIONS = [15, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 10080] as const;
export const durationLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} minutes`
    : minutes < 1440
      ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
      : minutes === 10080
        ? "1 week"
        : `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;

const SIGNATORY = "Authorised signatory";

export const SECTIONS = {
  bill: {
    fields: {
      showLogo: {
        kind: "check",
        label: "The shop’s logo",
        group: "Top of the bill",
        hint: "Whatever the law asks a bill to show is always printed: the shop’s name, address, contact and (once added) GSTIN, the bill number and date, and the GST lines on a tax invoice.",
        default: false,
      },
      showCustomerPhone: {
        kind: "check",
        label: "Customer’s phone number",
        group: "Order details",
        default: false,
      },
      showPayment: { kind: "check", label: "How it was paid, and whether it is paid", default: true },
      showMrp: {
        kind: "check",
        label: "MRP of each item and how much the customer saved",
        hint: "The MRP as set on each product.",
        default: false,
      },
      amountInWords: { kind: "check", label: "Total in words", group: "Bottom of the bill", default: true },
      thankYou: { kind: "text", label: "Thank-you line", default: "Thank you for shopping with us!", max: 200 },
      terms: {
        kind: "text",
        label: "Terms",
        hint: "Returns, exchanges or warranty, in a few lines. Leave blank for none.",
        default: "",
        max: 600,
        long: true,
      },
      footerNote: { kind: "text", label: "Note at the very bottom", default: "This is a computer-generated bill.", max: 300 },
      showSignature: { kind: "check", label: "A signature line", default: false },
      signatureLabel: { kind: "text", label: "Words under the signature line", default: SIGNATORY, min: 2, max: 40 },
      showBankDetails: {
        kind: "check",
        label: "Bank and UPI details",
        hint: "Taken from School quotations → How schools pay you; shown once something is filled in there.",
        default: false,
      },
      style: {
        kind: "choice",
        label: "Bill style",
        group: "Paper and look",
        hint: "The boxed styles print on their own paper and ink; the colour below is for Modern only. Receipt paper always prints the narrow receipt. A kaccha bill is always boxed.",
        default: "modern",
        options: BILL_STYLES,
      },
      shopNameMr: {
        kind: "text",
        label: "Shop name in Marathi",
        hint: "On the Marathi and English bill.",
        default: "अग्रवाल ऑनलाइन",
        min: 2,
        max: 80,
      },
      greeting: {
        kind: "text",
        label: "Greeting at the foot of the Shree festive bill",
        hint: "For example: शुभ दीपावली · Happy Diwali. Leave blank for none.",
        default: "",
        max: 120,
      },
      paper: { kind: "choice", label: "Paper size", default: "a4", options: PAPERS },
      accent: { kind: "colour", label: "Colour of the lines and headings", default: "#1e3a8a" },
      openAs: {
        kind: "choice",
        label: "When the bill is opened",
        default: "page",
        options: [
          { value: "page", label: "It opens as a page to print or save as PDF" },
          { value: "download", label: "It downloads as a file" },
        ],
      },
    },
  },
  slip: {
    fields: {
      title: { kind: "text", label: "Title on the slip", group: "Top of the slip", default: "Packing slip", min: 2, max: 40 },
      showShopAddress: { kind: "check", label: "Shop address and phone", default: false },
      showPhone: { kind: "check", label: "Customer’s phone number", group: "What it shows", default: true },
      showInstructions: { kind: "check", label: "Customer’s delivery note", default: true },
      showPrices: { kind: "check", label: "Price of each item and the total", default: false },
      showPreference: { kind: "check", label: "What to do if an item is unavailable", default: true },
      showPayment: { kind: "check", label: "What the rider collects", default: true },
      showSignatures: { kind: "check", label: "Signature lines", group: "Bottom of the slip", default: true },
      signature1: { kind: "text", label: "First signature line", default: "Packed by", min: 2, max: 30 },
      signature2: { kind: "text", label: "Second signature line", default: "Checked by", min: 2, max: 30 },
      footerNote: { kind: "text", label: "Note at the bottom", hint: "Leave blank for none.", default: "", max: 200 },
      paper: { kind: "choice", label: "Paper size", default: "a4", options: PAPERS },
    },
  },
  quotation: {
    fields: {
      validityDays: {
        kind: "number",
        label: "A new quotation is valid for (days)",
        hint: "You can still change it on each quotation before sending.",
        group: "Validity",
        default: 15,
        min: 1,
        max: 365,
      },
      accountName: {
        kind: "text",
        label: "Account name",
        group: "How schools pay you",
        hint: "Printed on quotations under “Payment details” once any of these is filled in.",
        default: "",
        max: 80,
      },
      bankName: { kind: "text", label: "Bank and branch", default: "", max: 80 },
      accountNumber: {
        kind: "text",
        label: "Account number",
        default: "",
        max: 20,
        pattern: /^\d{6,20}$/,
        patternMessage: "Account number: digits only, 6 to 20 of them.",
      },
      ifsc: {
        kind: "text",
        label: "IFSC",
        default: "",
        max: 11,
        upper: true,
        pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/,
        patternMessage: "IFSC: 11 characters, like SBIN0001234.",
      },
      upiId: {
        kind: "text",
        label: "UPI ID",
        default: "",
        max: 60,
        pattern: /^[\w.-]{2,}@[A-Za-z]{2,}$/,
        patternMessage: "UPI ID: like agarwalonline@sbi.",
      },
      showSignature: { kind: "check", label: "A signature line", group: "Bottom of the quotation", default: false },
      signatureLabel: { kind: "text", label: "Words under the signature line", default: SIGNATORY, min: 2, max: 40 },
      footerNote: {
        kind: "text",
        label: "Extra note at the bottom",
        hint: "Your terms are set in Store settings → Business and tax details.",
        default: "",
        max: 300,
        long: true,
      },
    },
  },
  storefront: {
    fields: {
      announcementOn: {
        kind: "check",
        label: "Show an announcement bar at the top of every shop page",
        group: "Announcement",
        default: false,
      },
      announcement: {
        kind: "both",
        label: "Announcement",
        hint: "For example “Closed on 1 November for Diwali”. Shown only while the box above is ticked.",
        max: 160,
      },
      showFreeDelivery: { kind: "check", label: "“Free delivery from ₹…”", group: "Top strip", default: true },
      showWelcome: { kind: "check", label: "The welcome offer’s code", default: true },
      showSameDay: { kind: "check", label: "“Same-day before … · check your area”", default: true },
      heroBadge: {
        kind: "both",
        label: "Small label above the headline",
        group: "Home page",
        hint: "Every box left blank keeps the shop’s own words, shown faded inside it.",
        max: 60,
        own: { en: "Same-day delivery · Nagothane", mr: "त्याच दिवशी वितरण · नागोठणे" },
      },
      heroTitle: {
        kind: "both",
        label: "Headline, first part",
        hint: "{cutoff} becomes the same-day time, like 3 PM.",
        max: 60,
        own: { en: "Order by {cutoff},", mr: "{cutoff} पूर्वी ऑर्डर करा," },
      },
      heroHighlight: { kind: "both", label: "Headline, the part in yellow", max: 60, own: { en: "at your door today.", mr: "आज दारात." } },
      heroLead: { kind: "both", label: "Line under the headline", max: 240, long: true, own: { en: "Stationery, school supplies, toys and games at fair prices, carried to your door by the same people who serve you in store.", mr: "लेखन साहित्य, शालेय वस्तू, खेळणी आणि खेळ योग्य किमतीत, दुकानातील तीच माणसे तुमच्या दारापर्यंत पोहोचवतात." } },
      storyTitle: { kind: "both", label: "“How delivery works” heading", max: 80, own: { en: "A counter you already know.", mr: "तुमच्या ओळखीचाच काउंटर." } },
      storyBody: { kind: "both", label: "“How delivery works” text", max: 500, long: true, own: { en: "Agarwal Online is the website of Agarwal General Stores (Agarwal Stores) in Bazar Peth, Nagothane, also written Agrawal or Aggarwal, serving the town from one counter for years. The same shelves and the same prices, with delivery added. Order in English or Marathi and pay in cash at the door.", mr: "अग्रवाल ऑनलाइन ही नागोठण्याच्या बाजारपेठेतील अग्रवाल जनरल स्टोअरची (Agarwal General Stores, Agarwal Stores, Agrawal, Aggarwal) वेबसाइट आहे, वर्षानुवर्षे एकाच काउंटरवरून सेवा देणारी. त्याच वस्तू आणि त्याच किमती, फक्त वितरणाची सोय जोडली आहे. इंग्रजी किंवा मराठीत ऑर्डर करा आणि दारात रोख द्या." } },
      footerTagline: {
        kind: "both",
        label: "Line under the name in the footer",
        group: "Footer",
        max: 200,
        long: true,
        own: {
          en: "Stationery, school supplies, toys and games from your neighbourhood store in Nagothane.",
          mr: "नागोठण्यातील तुमच्या ओळखीच्या दुकानातून लेखन साहित्य, शालेय वस्तू, खेळणी आणि खेळ.",
        },
      },
      footerContact: {
        kind: "check",
        label: "The shop’s phone, email and address in the footer",
        hint: "From Store settings → Business and tax details.",
        default: false,
      },
      seoTitle: {
        kind: "text",
        label: "Title in Google and link previews",
        group: "Google and link previews",
        // the signboard's name and the town first: that is what people type, and what Maps calls the shop
        default: "Agarwal General Store Nagothane: Stationery & Toys Online",
        min: 10,
        max: 70,
      },
      seoDescription: {
        kind: "text",
        label: "Description in Google",
        // the words people type: order online, home delivery, cash on delivery; Google shows about 160 characters
        hint: "Google shows about the first 160 characters.",
        default:
          "Agarwal General Store (also Agrawal), Bazar Peth, Nagothane: order stationery, school supplies, toys and games online. Same-day home delivery, cash on delivery.",
        min: 50,
        max: 300,
        long: true,
      },
    },
  },
  messages: {
    fields: {
      orderConfirmed: {
        kind: "text",
        label: "Order confirmed",
        hint: "{order} becomes the order number. Leave a box blank for the built-in message.",
        placeholder: "{order} is now being prepared.",
        default: "",
        max: 300,
        long: true,
      },
      outForDelivery: {
        kind: "text",
        label: "Out for delivery",
        placeholder: "{order} is out for delivery.",
        default: "",
        max: 300,
        long: true,
      },
      delivered: {
        kind: "text",
        label: "Delivered",
        placeholder: "{order} was delivered. How was it? Rate your items in one tap.",
        default: "",
        max: 300,
        long: true,
      },
    },
  },
  numbers: {
    fields: {
      orderPrefix: {
        kind: "text",
        label: "Order numbers start with",
        hint: "New orders only, like AO-20261019-00001. Orders already placed keep their numbers.",
        default: "AGS",
        min: 2,
        max: 6,
        upper: true,
        pattern: /^[A-Z]{2,6}$/,
        patternMessage: "Order numbers start with: 2 to 6 letters, like AO.",
      },
      quotePrefix: {
        kind: "text",
        label: "Quotation numbers start with",
        hint: "Quotations sent from now on.",
        default: "AGSQ",
        min: 2,
        max: 6,
        upper: true,
        pattern: /^[A-Z]{2,6}$/,
        patternMessage: "Quotation numbers start with: 2 to 6 letters, like AOQ.",
      },
    },
  },
  defaults: {
    fields: {
      packOrderLimit: {
        kind: "number",
        label: "Most of one pack a customer can order",
        group: "A new pack size",
        default: 10,
        min: 1,
        max: 100,
      },
      areaFee: { kind: "money", label: "Delivery fee (₹)", group: "A new service area", default: 3000, max: 100000 },
      areaCodLimit: { kind: "money", label: "Largest cash-on-delivery order (₹)", default: 500000, max: 10000000 },
      slotCapacity: {
        kind: "number",
        label: "Orders each delivery time can take",
        group: "A new delivery time",
        default: 20,
        min: 1,
        max: 10000,
      },
      offerDays: { kind: "number", label: "Days a new offer runs", group: "A new offer", default: 30, min: 1, max: 365 },
      analyticsDays: {
        kind: "number",
        label: "Days Analytics shows when it opens",
        group: "Analytics",
        default: 30,
        min: 7,
        max: 365,
      },
    },
  },
  queues: {
    fields: {
      toConfirm: { kind: "duration", label: "Orders to confirm", default: 60 },
      packing: { kind: "duration", label: "Orders being packed", default: 240 },
      ready: { kind: "duration", label: "Packed, no rider assigned", default: 60 },
      notDelivered: { kind: "duration", label: "Deliveries that didn’t go through", default: 120 },
      cash: { kind: "duration", label: "Cash collections to reconcile", default: 1440 },
      chats: { kind: "duration", label: "Support chats waiting for a reply", default: 30 },
      complaints: { kind: "duration", label: "Open complaints", default: 1440 },
      lowRatings: { kind: "duration", label: "Low ratings to read", default: 1440 },
      approvals: { kind: "duration", label: "Changes waiting for approval", default: 1440 },
      refundOwed: { kind: "duration", label: "Refunds owed for items not packed", default: 1440 },
      refunds: { kind: "duration", label: "Refunds in progress", default: 2880 },
    },
  },
} as const satisfies Record<string, { fields: Record<string, FieldSpec> }>;

export type SectionKey = keyof typeof SECTIONS;
type Spec<K extends SectionKey> = (typeof SECTIONS)[K]["fields"];
type ValueOf<S> = S extends { kind: "check" }
  ? boolean
  : S extends { kind: "both" }
    ? { en: string; mr: string }
    : S extends { kind: "number" | "money" | "duration" }
      ? number
      : string;
export type SectionValues<K extends SectionKey> = { -readonly [F in keyof Spec<K>]: ValueOf<Spec<K>[F]> };
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

const fieldsOf = (section: SectionKey) => SECTIONS[section].fields as Record<string, FieldSpec>;

function schemaOf(name: string, spec: FieldSpec): z.ZodType {
  const label = spec.label.replace(/\s*\(.*\)$/, "");
  switch (spec.kind) {
    case "check":
      return z.boolean();
    case "text": {
      let text: z.ZodType<string> = z.string().trim().max(spec.max, `${label}: at most ${spec.max} characters.`);
      if (spec.min) text = (text as z.ZodString).min(spec.min, `${label}: at least ${spec.min} characters.`);
      if (spec.pattern) {
        const pattern = spec.pattern;
        text = text.refine((value) => !value || pattern.test(value), spec.patternMessage ?? `${label}: check the format.`);
      }
      return text;
    }
    case "both": {
      const one = z.string().trim().max(spec.max, `${label}: at most ${spec.max} characters.`);
      return z.object({ en: one, mr: one });
    }
    case "choice":
      return z.enum(spec.options.map((option) => option.value) as [string, ...string[]], { error: `${label}: pick one.` });
    case "number":
      return z
        .number({ error: `${label}: enter a whole number.` })
        .int(`${label}: enter a whole number.`)
        .min(spec.min, `${label}: at least ${spec.min}.`)
        .max(spec.max, `${label}: at most ${spec.max}.`);
    case "money":
      return z
        .number({ error: `${label}: enter an amount in rupees.` })
        .int()
        .min(0, `${label}: enter an amount in rupees.`)
        .max(spec.max, `${label}: at most ₹${spec.max / 100}.`);
    case "duration":
      return z.number().refine((value) => (DURATIONS as readonly number[]).includes(value), `${label}: pick one.`);
    case "colour":
      return z.string().regex(/^#[0-9a-f]{6}$/i, `${label}: pick a colour.`);
    default:
      throw Error(`Unknown field kind for ${name}`);
  }
}

function defaultOf(spec: FieldSpec): unknown {
  return spec.kind === "both" ? { en: "", mr: "" } : spec.default;
}

/** Every field at its default: how the shop worked before Customize existed. */
export function defaultsOf<K extends SectionKey>(section: K): SectionValues<K> {
  return Object.fromEntries(
    Object.entries(fieldsOf(section)).map(([name, spec]) => [name, defaultOf(spec)]),
  ) as SectionValues<K>;
}

/** What was stored, field by field; a field that is missing or no longer fits falls back to its default. */
export function readValues<K extends SectionKey>(section: K, stored: unknown): SectionValues<K> {
  const value = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fieldsOf(section)).map(([name, spec]) => {
      const parsed = schemaOf(name, spec).safeParse(value[name]);
      return [name, parsed.success ? parsed.data : defaultOf(spec)];
    }),
  ) as SectionValues<K>;
}

/** The form's fields as this section's values, validated; throws a ZodError with a plain message. */
export function valuesFromForm<K extends SectionKey>(section: K, form: FormData): SectionValues<K> {
  const raw: Record<string, unknown> = {};
  const shape: Record<string, z.ZodType> = {};
  for (const [name, spec] of Object.entries(fieldsOf(section))) {
    shape[name] = schemaOf(name, spec);
    const text = String(form.get(name) ?? "").trim();
    switch (spec.kind) {
      case "check":
        raw[name] = form.has(name);
        break;
      case "both":
        raw[name] = { en: String(form.get(`${name}En`) ?? ""), mr: String(form.get(`${name}Mr`) ?? "") };
        break;
      case "number":
      case "duration":
        raw[name] = text === "" ? Number.NaN : Number(text);
        break;
      case "money":
        raw[name] = paiseFromRupees(form.get(`${name}Rupees`)) ?? Number.NaN;
        break;
      case "text":
        raw[name] = spec.upper ? text.toUpperCase() : text;
        break;
      default:
        raw[name] = text;
    }
  }
  return z.object(shape).parse(raw) as SectionValues<K>;
}

const keyOf = (section: SectionKey) => `shop-${section}`;

async function readSection<K extends SectionKey>(section: K): Promise<SectionValues<K>> {
  await connectDB();
  const setting = await SystemSetting.findOne({ key: keyOf(section) }).lean<{ value?: unknown }>();
  return readValues(section, setting?.value);
}

/**
 * One section's values, from the shop cache like the other settings; `fresh` reads the database
 * (for a quotation, which keeps a copy of what it was sent with).
 */
export function shopSettings<K extends SectionKey>(section: K, fresh = false): Promise<SectionValues<K>> {
  return fresh ? readSection(section) : shared(`shop-settings-${section}`, () => readSection(section));
}

/** An owner saves one section. Recorded in the audit trail with what it was before. */
export async function saveShopSettings(actorId: string, section: SectionKey, form: FormData) {
  await connectDB();
  // checkout imports this file, so it doesn't import commerce/service back for its id check
  if (!mongoose.isValidObjectId(actorId)) throw Error("UNAUTHENTICATED");
  const actor = await User.findOne({ _id: actorId, active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  const after = valuesFromForm(section, form);
  await mongoose.connection.transaction(async (session) => {
    const before = (await SystemSetting.findOne({ key: keyOf(section) }).session(session))?.value ?? null;
    await SystemSetting.updateOne(
      { key: keyOf(section) },
      { $set: { value: after }, $inc: { version: 1 } },
      { upsert: true, session },
    );
    await AuditLog.create(
      [{ actorId, action: `customize.${section}`, target: keyOf(section), details: { before, after } }],
      { session },
    );
  });
  return after;
}

/**
 * "Use this style" under Customize → Bills: changes the bill style only, leaving the other bill
 * settings as saved. Recorded in the audit trail like a full save.
 */
export async function saveBillStyle(actorId: string, style: unknown) {
  await connectDB();
  if (!mongoose.isValidObjectId(actorId)) throw Error("UNAUTHENTICATED");
  const actor = await User.findOne({ _id: actorId, active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  const chosen = z.enum(BILL_STYLES.map((option) => option.value) as [string, ...string[]]).parse(style);
  await mongoose.connection.transaction(async (session) => {
    const before = (await SystemSetting.findOne({ key: keyOf("bill") }).session(session))?.value ?? null;
    const after = { ...readValues("bill", before), style: chosen };
    await SystemSetting.updateOne({ key: keyOf("bill") }, { $set: { value: after }, $inc: { version: 1 } }, { upsert: true, session });
    await AuditLog.create([{ actorId, action: "customize.bill", target: keyOf("bill"), details: { before, after } }], { session });
  });
  return chosen;
}

/** "{cutoff}", "{order}" and the like, filled in. */
export function fill(text: string, tokens: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => tokens[name] ?? whole);
}

/** A bilingual setting in the reader's language, or the shop's own wording when left blank. */
export function words(value: { en: string; mr: string }, locale: "en" | "mr", fallback: string) {
  return value[locale]?.trim() || fallback;
}

/** A customer message as the owner wrote it in Customize, or the built-in one when left blank. */
export async function customerMessage(name: keyof SectionValues<"messages">, order: string) {
  const text = (await shopSettings("messages"))[name] || SECTIONS.messages.fields[name].placeholder;
  return fill(text, { order });
}

type FrontWords = "heroBadge" | "heroTitle" | "heroHighlight" | "heroLead" | "storyTitle" | "storyBody" | "footerTagline";
/** A Shop front wording in the reader's language: the owners' words, or the shop's own. */
export function frontWords(front: SectionValues<"storefront">, name: FrontWords, locale: "en" | "mr") {
  return words(front[name], locale, SECTIONS.storefront.fields[name].own[locale]);
}
