import { describe, it, expect } from "vitest";
import {
  allocate,
  discountPaiseFor,
  exGst,
  isExpired,
  istDatePlus,
  quoteNumber,
  quoteTotals,
  startingUnitPrice,
  supplyType,
} from "../src/lib/schools/quote-math";

describe("Quotation GST maths", () => {
  it("adds CGST and SGST within the state, IGST to another state", () => {
    const lines = [{ quantity: 10, unitPricePaise: 10000, gstRatePercent: 18 }];
    const same = quoteTotals(lines, { type: "none" }, "intra");
    expect(same).toMatchObject({ subtotalPaise: 100000, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, totalPaise: 118000, units: 10 });
    const other = quoteTotals(lines, { type: "none" }, "inter");
    expect(other).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 18000, totalPaise: 118000 });
  });

  it("rounds each tax half-up to the paisa, CGST and SGST always equal", () => {
    // 3 × ₹33.33 = ₹99.99 at 18%: each half is 899.91 paise → 900
    const t = quoteTotals([{ quantity: 3, unitPricePaise: 3333, gstRatePercent: 18 }], { type: "none" }, "intra");
    expect(t).toMatchObject({ taxablePaise: 9999, cgstPaise: 900, sgstPaise: 900, totalPaise: 11799 });
    expect(quoteTotals([{ quantity: 3, unitPricePaise: 3333, gstRatePercent: 18 }], { type: "none" }, "inter").igstPaise).toBe(1800);
    // exact halves round up: 125 × 18% / 2 = 11.25 → 11; 125 × 5% / 2 = 3.125 → 3; 150 × 5% / 2 = 3.75 → 4
    expect(quoteTotals([{ quantity: 1, unitPricePaise: 150, gstRatePercent: 5 }], { type: "none" }, "intra").cgstPaise).toBe(4);
    expect(quoteTotals([{ quantity: 1, unitPricePaise: 100, gstRatePercent: 5 }], { type: "none" }, "intra").cgstPaise).toBe(3); // 2.5 → 3
    expect(quoteTotals([{ quantity: 1, unitPricePaise: 75, gstRatePercent: 5 }], { type: "none" }, "inter").igstPaise).toBe(4); // 3.75 → 4
  });

  it("spreads a discount across lines before tax and taxes each rate separately", () => {
    const t = quoteTotals(
      [
        { quantity: 1, unitPricePaise: 10000, gstRatePercent: 5 },
        { quantity: 1, unitPricePaise: 20000, gstRatePercent: 18 },
      ],
      { type: "amount", paise: 3000 },
      "intra",
    );
    expect(t.lines.map((l) => l.discountPaise)).toEqual([1000, 2000]);
    expect(t.taxes).toEqual([
      { ratePercent: 5, taxablePaise: 9000, cgstPaise: 225, sgstPaise: 225, igstPaise: 0 },
      { ratePercent: 18, taxablePaise: 18000, cgstPaise: 1620, sgstPaise: 1620, igstPaise: 0 },
    ]);
    expect(t.totalPaise).toBe(30690);
  });

  it("keeps a 0% line in the summary with no tax, and a full discount leaves nothing to tax", () => {
    const zero = quoteTotals([{ quantity: 120, unitPricePaise: 4500, gstRatePercent: 0 }], { type: "none" }, "intra");
    expect(zero.taxes).toEqual([{ ratePercent: 0, taxablePaise: 540000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }]);
    expect(zero.totalPaise).toBe(540000);
    const free = quoteTotals([{ quantity: 2, unitPricePaise: 500, gstRatePercent: 18 }], { type: "amount", paise: 99999 }, "intra");
    expect(free).toMatchObject({ discountPaise: 1000, taxablePaise: 0, cgstPaise: 0, totalPaise: 0 });
  });

  it("works exactly on very large quotations", () => {
    const t = quoteTotals([{ quantity: 100000, unitPricePaise: 9999999, gstRatePercent: 18 }], { type: "none" }, "inter");
    expect(t.subtotalPaise).toBe(999999900000);
    expect(t.igstPaise).toBe(179999982000);
    expect(t.totalPaise).toBe(1179999882000);
  });

  it("splits money into whole paise that always add back up", () => {
    expect(allocate(100, [100, 100, 100])).toEqual([34, 33, 33]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
    const shares = allocate(9999, [3, 7, 11, 13]);
    expect(shares.reduce((n, s) => n + s, 0)).toBe(9999);
  });

  it("works out discounts in paise", () => {
    expect(discountPaiseFor(12345, { type: "percent", percent: 5 })).toBe(617);
    expect(discountPaiseFor(500, { type: "amount", paise: 900 })).toBe(500);
    expect(discountPaiseFor(500, { type: "none" })).toBe(0);
  });

  it("starts a line at the school price, else the shop price without its GST", () => {
    expect(exGst(11800, 18)).toBe(10000);
    expect(exGst(10000, 5)).toBe(9524);
    expect(exGst(4500, 0)).toBe(4500);
    expect(startingUnitPrice({ schoolPricePaise: 4000, shopPricePaise: 5900, gstRatePercent: 18 })).toEqual({ unitPricePaise: 4000, from: "school" });
    expect(startingUnitPrice({ shopPricePaise: 5900, gstRatePercent: 18 })).toEqual({ unitPricePaise: 5000, from: "shop-ex-gst" });
    expect(startingUnitPrice({ shopPricePaise: 5900 })).toEqual({ unitPricePaise: 5900, from: "shop-check-rate" });
  });

  it("decides the supply type from the states", () => {
    expect(supplyType("27", "27")).toBe("intra");
    expect(supplyType("27", undefined)).toBe("intra");
    expect(supplyType("27", "24")).toBe("inter");
  });

  it("keeps a quotation valid through its last day, India time", () => {
    expect(isExpired("2026-10-02", new Date("2026-10-02T18:29:00Z"))).toBe(false); // 23:59 IST
    expect(isExpired("2026-10-02", new Date("2026-10-02T18:30:00Z"))).toBe(true); // midnight IST
    expect(istDatePlus(15, new Date("2026-10-02T06:00:00Z"))).toBe("2026-10-17");
    expect(quoteNumber("20261002", 7)).toBe("AGSQ-20261002-00007");
  });
});
