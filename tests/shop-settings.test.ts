import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { defaultsOf, fill, frontWords, readValues, valuesFromForm, words } from "../src/lib/settings/shop";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

describe("shop settings", () => {
  it("start where the shop was before Customize existed", () => {
    const bill = defaultsOf("bill");
    expect(bill.showLogo).toBe(false);
    expect(bill.showPayment).toBe(true);
    expect(bill.showMrp).toBe(false);
    expect(bill.paper).toBe("a4");
    // today's layout until the owner picks a boxed one; no bank details until asked for
    expect(bill.style).toBe("modern");
    expect(bill.showBankDetails).toBe(false);
    expect(bill.shopNameMr).toBe("अग्रवाल ऑनलाइन");
    expect(bill.greeting).toBe("");
    expect(readValues("bill", { style: "shree" }).style).toBe("shree");
    expect(readValues("bill", { style: "fancy" }).style).toBe("modern");
    expect(defaultsOf("numbers")).toEqual({ orderPrefix: "AGS", quotePrefix: "AGSQ" });
    expect(defaultsOf("storefront").heroBadge).toEqual({ en: "", mr: "" });
    expect(defaultsOf("defaults").areaFee).toBe(3000);
  });

  it("keep what fits and fall back field by field for what doesn't", () => {
    const bill = readValues("bill", { thankYou: "Visit again", paper: "letter", accent: "blue", showLogo: true });
    expect(bill.thankYou).toBe("Visit again");
    expect(bill.showLogo).toBe(true);
    expect(bill.paper).toBe("a4");
    expect(bill.accent).toBe("#1e3a8a");
    expect(readValues("bill", null)).toEqual(defaultsOf("bill"));
  });

  it("read a submitted form: ticks, both languages, rupees and letters in capitals", () => {
    const store = valuesFromForm(
      "storefront",
      form({
        theme: "bus",
        announcementOn: "on",
        announcementEn: "Closed on Diwali",
        announcementMr: "दिवाळीला बंद",
        showWelcome: "on",
        seoTitle: "Agarwal Online | Nagothane",
        seoDescription: "Stationery, toys and games delivered the same day in and around Nagothane, Raigad.",
      }),
    );
    expect(store.theme).toBe("bus");
    expect(store.announcementOn).toBe(true);
    expect(store.showFreeDelivery).toBe(false);
    expect(store.announcement).toEqual({ en: "Closed on Diwali", mr: "दिवाळीला बंद" });
    expect(valuesFromForm("numbers", form({ orderPrefix: "ao", quotePrefix: "aoq" }))).toEqual({
      orderPrefix: "AO",
      quotePrefix: "AOQ",
    });
    const defaults = valuesFromForm(
      "defaults",
      form({ packOrderLimit: "12", areaFeeRupees: "40", areaCodLimitRupees: "2500.50", slotCapacity: "15", offerDays: "7", analyticsDays: "60", riderPayRupees: "25" }),
    );
    expect(defaults.areaFee).toBe(4000);
    expect(defaults.riderPay).toBe(2500);
    expect(defaults.areaCodLimit).toBe(250050);
  });

  it("say what's wrong in plain words", () => {
    const bad = () => valuesFromForm("quotation", form({ validityDays: "15", ifsc: "sbin123", signatureLabel: "Owner" }));
    expect(bad).toThrow(ZodError);
    try {
      bad();
    } catch (error) {
      expect((error as ZodError).issues[0].message).toBe("IFSC: 11 characters, like SBIN0001234.");
    }
    expect(() => valuesFromForm("numbers", form({ orderPrefix: "A1", quotePrefix: "AOQ" }))).toThrow(
      "Order numbers start with: 2 to 6 letters, like AO.",
    );
  });

  it("fill tokens and fall back to the shop's own words", () => {
    expect(fill("Order by {cutoff}, ", { cutoff: "3 PM" })).toBe("Order by 3 PM, ");
    expect(fill("{order} is on its way", {})).toBe("{order} is on its way");
    expect(words({ en: "", mr: "" }, "en", "Same-day delivery")).toBe("Same-day delivery");
    expect(words({ en: "Fast", mr: "" }, "en", "Same-day delivery")).toBe("Fast");
    const front = readValues("storefront", { heroLead: { en: "Our own words", mr: "" } });
    expect(frontWords(front, "heroLead", "en")).toBe("Our own words");
    expect(frontWords(front, "heroLead", "mr")).toMatch(/^लेखन साहित्य/);
    expect(frontWords(front, "heroTitle", "en")).toBe("What do you need");
    // an owner's own headline can still name the same-day time
    const timed = readValues("storefront", { heroTitle: { en: "Order by {cutoff},", mr: "" } });
    expect(fill(frontWords(timed, "heroTitle", "en"), { cutoff: "3 PM" })).toBe("Order by 3 PM,");
  });

  it("credit the developer until Tech changes it, and hide contacts left blank", () => {
    const defaults = defaultsOf("team");
    // as a browser sends the form: a ticked box as "on", an unticked one not at all
    const team = Object.fromEntries(
      Object.entries(defaults).flatMap(([key, value]) =>
        typeof value === "boolean" ? (value ? [[key, "on"]] : []) : [[key, String(value)]],
      ),
    ) as Record<string, string>;
    expect(team.devName).toBe("Krish Modi");
    expect(team.devRole).toBe("Lead developer");
    expect(team.devEmail).toBe("krishmodi3030@gmail.com");
    expect([team.devPhoto, team.devWhatsapp, team.devInstagram, team.devLinkedin, team.devPortfolio]).toEqual(["", "", "", "", ""]);
    expect(team.helperName).toBe("Swarnabh");
    expect([defaults.showFooterCard, defaults.hireOn]).toEqual([true, true]);
    // Swarnabh's card can be hidden by leaving his name blank, and takes the same kinds of contact
    expect(valuesFromForm("team", form({ ...team, helperName: "" })).helperName).toBe("");
    expect(() => valuesFromForm("team", form({ ...team, helperWhatsapp: "12345" }))).toThrow(ZodError);
    expect(valuesFromForm("team", form({ ...team, helperGithub: "https://github.com/swarnabh" })).helperGithub).toBe("https://github.com/swarnabh");
    const saved = valuesFromForm(
      "team",
      form({ ...team, devWhatsapp: "9876543210", devLinkedin: "https://www.linkedin.com/in/krish", devInstagram: "https://instagram.com/krish" }),
    );
    expect(saved.devWhatsapp).toBe("9876543210");
    expect(() => valuesFromForm("team", form({ ...team, devWhatsapp: "12345" }))).toThrow(ZodError);
    expect(() => valuesFromForm("team", form({ ...team, devLinkedin: "linkedin.com/in/krish" }))).toThrow(ZodError);
    expect(() => valuesFromForm("team", form({ ...team, devPhoto: "http://example.com/me.jpg" }))).toThrow(ZodError);
    // an uploaded photo: this site's own address, or the photo service's
    expect(valuesFromForm("team", form({ ...team, devPhoto: "/api/evidence/0123456789abcdef01234567" })).devPhoto).toBe("/api/evidence/0123456789abcdef01234567");
    expect(valuesFromForm("team", form({ ...team, devPhoto: "https://res.cloudinary.com/x/me.jpg" })).devPhoto).toBe("https://res.cloudinary.com/x/me.jpg");
  });
});
