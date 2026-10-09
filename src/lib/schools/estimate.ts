import { quoteTotals } from "./quote-math";

export type EstimateLine = { quantity: number; schoolPricePaise?: number | null; gstRatePercent?: number | null };
export type Estimate = {
  /** The school prices that are set, before GST. */
  subtotalPaise: number;
  /** GST on the lines whose rate is known, rounded the way the quotation will be. */
  gstPaise: number;
  totalPaise: number;
  units: number;
  /** Lines with no school price yet: the store prices them on the quotation. */
  onQuotation: number;
  /** Priced lines whose GST rate isn't set yet, so they're in the subtotal but not the GST. */
  rateUnknown: number;
};

/**
 * What the basket should come to, before the store prices it: school prices, plus GST worked
 * out per rate as the quotation will. It is an estimate; the quotation is what counts.
 */
export function estimateQuote(lines: EstimateLine[]): Estimate {
  const priced = lines.filter((line) => line.schoolPricePaise != null);
  const taxed = priced.filter((line) => line.gstRatePercent != null);
  const totals = quoteTotals(
    taxed.map((line) => ({
      quantity: line.quantity,
      unitPricePaise: line.schoolPricePaise!,
      gstRatePercent: line.gstRatePercent!,
    })),
    { type: "none" },
    "intra",
  );
  const subtotalPaise = priced.reduce((n, line) => n + line.quantity * line.schoolPricePaise!, 0);
  const gstPaise = totals.cgstPaise + totals.sgstPaise + totals.igstPaise;
  return {
    subtotalPaise,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
    units: lines.reduce((n, line) => n + line.quantity, 0),
    onQuotation: lines.length - priced.length,
    rateUnknown: priced.length - taxed.length,
  };
}
