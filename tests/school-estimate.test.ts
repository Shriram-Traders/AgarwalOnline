import { describe, expect, it } from "vitest";
import { estimateQuote } from "../src/lib/schools/estimate";
import { quoteTotals } from "../src/lib/schools/quote-math";

describe("the school basket's expected bill", () => {
  it("adds GST per rate the way the quotation will", () => {
    const lines = [
      { quantity: 500, schoolPricePaise: 4250, gstRatePercent: 18 },
      { quantity: 12, schoolPricePaise: 51000, gstRatePercent: 0 },
      { quantity: 3, schoolPricePaise: 333, gstRatePercent: 5 },
    ];
    const estimate = estimateQuote(lines);
    const quotation = quoteTotals(
      lines.map((line) => ({ quantity: line.quantity, unitPricePaise: line.schoolPricePaise, gstRatePercent: line.gstRatePercent })),
      { type: "none" },
      "intra",
    );
    expect(estimate.subtotalPaise).toBe(quotation.subtotalPaise);
    expect(estimate.gstPaise).toBe(quotation.cgstPaise + quotation.sgstPaise);
    expect(estimate.totalPaise).toBe(quotation.totalPaise);
    expect(estimate.units).toBe(515);
  });

  it("counts what the store still has to price, and leaves an unknown rate out of the GST", () => {
    const estimate = estimateQuote([
      { quantity: 500, schoolPricePaise: 4250, gstRatePercent: 18 },
      { quantity: 10, schoolPricePaise: null, gstRatePercent: 18 },
      { quantity: 4, schoolPricePaise: 1000 },
    ]);
    expect(estimate).toMatchObject({
      subtotalPaise: 2_125_000 + 4000,
      gstPaise: 382_500,
      totalPaise: 2_125_000 + 4000 + 382_500,
      units: 514,
      onQuotation: 1,
      rateUnknown: 1,
    });
    expect(estimateQuote([])).toMatchObject({ subtotalPaise: 0, gstPaise: 0, totalPaise: 0, onQuotation: 0 });
  });
});
