import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../next.config";
import { contactDoc } from "../src/lib/legal/contact";
import { LEGAL_DOCS } from "../src/lib/legal/docs";
import { DEFAULT_FACTS } from "../src/lib/legal/format";
import { notice, type NoticeKind } from "../src/lib/legal/notices";
import { LEGAL_PAGES, POLICIES_HOME } from "../src/lib/legal/pages";
import { privacyDoc } from "../src/lib/legal/privacy";
import { shippingDoc } from "../src/lib/legal/shipping";
import { termsDoc } from "../src/lib/legal/terms";
import type { Block, LegalDoc, LegalFacts } from "../src/lib/legal/types";

const DOCS = LEGAL_DOCS;

const LIVE: LegalFacts = {
  ...DEFAULT_FACTS,
  business: {
    legalName: "Agarwal General Stores",
    address: "Main Road, Nagothane, Raigad 402106",
    gstin: "27AAPFU0939F1ZV",
    phone: "9876543210",
    email: "help@example.in",
    grievanceName: "R. Agarwal",
    grievanceDesignation: "Proprietor",
  },
  holidays: [0],
  blackoutDates: ["2026-10-20"],
  areas: [
    {
      name: "Nagothane",
      feePaise: 3000,
      codEnabled: true,
      codLimitPaise: 500000,
      times: [
        { days: [1, 2, 3, 4, 5, 6], window: "10:00 AM – 1:00 PM" },
        { days: [1, 2, 3, 4, 5, 6], window: "4:00 PM – 7:00 PM" },
      ],
    },
    { name: "Roha", feePaise: 5000, codEnabled: false, codLimitPaise: 0, times: [] },
  ],
};

const texts = (block: Block): string[] =>
  typeof block === "string" ? [block] : "list" in block ? block.list : block.rows.flat();
const allText = (doc: LegalDoc) => [doc.title, doc.lead, ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap(texts)])];
const words = (doc: LegalDoc) => allText(doc).join("\n");

describe("store policies", () => {
  it("has the same sections, in the same order, in English and Marathi, none of them empty", () => {
    for (const [key, builder] of Object.entries(DOCS))
      for (const facts of [DEFAULT_FACTS, LIVE]) {
        const en = builder.en(facts);
        const mr = builder.mr(facts);
        expect(mr.sections.map((s) => s.id), key).toEqual(en.sections.map((s) => s.id));
        for (const doc of [en, mr])
          for (const section of doc.sections) {
            expect(section.blocks.length, `${key}#${section.id}`).toBeGreaterThan(0);
            for (const text of section.blocks.flatMap(texts)) expect(text.trim(), `${key}#${section.id}`).not.toBe("");
          }
        // the Marathi pages are really in Marathi
        expect(words(mr), key).toMatch(/[ऀ-ॿ]/);
      }
  });

  it("keeps the store's final say in disputes without taking away consumer rights", () => {
    const disputes = termsDoc.en(LIVE).sections.find((s) => s.id === "disputes")!;
    const text = disputes.blocks.flatMap(texts).join("\n");
    expect(text).toContain("its decision is final within the store's own process");
    expect(text).toContain("The website version applies");
    expect(text).toContain("English version prevails");
    expect(text).toContain("Consumer Protection Act, 2019");
    expect(text).toContain("Raigad");
    expect(termsDoc.mr(LIVE).sections.find((s) => s.id === "disputes")!.blocks.flatMap(texts).join("\n")).toContain(
      "ग्राहक संरक्षण कायदा, 2019",
    );
  });

  it("quotes delivery rules from Store settings", () => {
    const fresh = words(shippingDoc.en(DEFAULT_FACTS));
    expect(fresh).toContain("₹500");
    expect(fresh).toContain("3:00 PM");
    expect(fresh).toContain("Delivery areas are being set up");
    const live = words(shippingDoc.en(LIVE));
    expect(live).toContain("Delivery ₹30, free from ₹500. Cash on delivery up to ₹5,000. Monday–Saturday: 10:00 AM – 1:00 PM, 4:00 PM – 7:00 PM.");
    expect(live).toContain("No cash on delivery.");
    expect(live).toContain("No deliveries on Sunday.");
    expect(live).toContain("No deliveries on 20 October 2026.");
    expect(words(shippingDoc.mr(LIVE))).toContain("सोमवार–शनिवार");
  });

  it("names the grievance officer once Store settings has one, and says when details are missing", () => {
    expect(words(contactDoc.en(DEFAULT_FACTS))).toContain("Being added");
    expect(words(contactDoc.mr(DEFAULT_FACTS))).toContain("लवकरच जोडले जाईल");
    const live = words(contactDoc.en(LIVE));
    expect(live).not.toContain("Being added");
    expect(live).toContain("R. Agarwal");
    expect(live).toContain("Proprietor");
    expect(live).toContain("[9876543210](tel:+919876543210)");
    expect(live).toContain("27AAPFU0939F1ZV");
  });

  it("says how long photos are kept, from the cleanup job's setting", () => {
    expect(words(privacyDoc.en({ ...LIVE, evidenceDays: 45 }))).toContain("45 days.");
    expect(notice("evidence", "en", { days: 45 })).toContain("deleted after 45 days");
  });

  it("links only to pages and sections that exist", () => {
    const kinds: NoticeKind[] = [
      "signin", "signup", "address", "complaint", "evidence", "review", "feedback",
      "chat", "handoff", "school-join", "school-quote", "school-accept", "rider", "staff",
    ];
    const notices = (["en", "mr"] as const).flatMap((locale) => kinds.map((kind) => notice(kind, locale, { google: true })));
    const docs = Object.values(DOCS).flatMap((builder) => [builder.en(LIVE), builder.mr(LIVE)]);
    const ids = new Map(
      LEGAL_PAGES.map((page) => [page.href, new Set(DOCS[page.key].en(LIVE).sections.map((s) => s.id))]),
    );
    for (const text of [...notices, ...docs.flatMap(allText)])
      for (const [, href] of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const [path, hash] = href.split("#");
        expect(existsSync(join(__dirname, "..", "src", "app", path, "page.tsx")), href).toBe(true);
        if (hash && ids.has(path)) expect(ids.get(path)!.has(hash), href).toBe(true);
      }
    for (const page of [POLICIES_HOME, ...LEGAL_PAGES])
      expect(existsSync(join(__dirname, "..", "src", "app", page.href, "page.tsx")), page.href).toBe(true);
  });

  it("lives under /p with each title spelled out, and the short addresses forward there", async () => {
    for (const page of LEGAL_PAGES) {
      const spelled = page.title.en.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, "-");
      expect(page.href).toBe(`${POLICIES_HOME.href}/${spelled}`);
    }
    const redirects = await config.redirects!();
    for (const page of LEGAL_PAGES)
      expect(redirects).toContainEqual({ source: `/${page.key}`, destination: page.href, permanent: true });
    // nothing is left at the short addresses that would win over the forward
    for (const page of LEGAL_PAGES) expect(existsSync(join(__dirname, "..", "src", "app", page.key)), page.key).toBe(false);
  });
});
