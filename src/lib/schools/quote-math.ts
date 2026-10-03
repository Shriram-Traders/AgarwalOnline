import { istDate } from "../commerce/delivery";

/*
 * Money on school quotations, in whole paise. Prices the owner types are before GST and tax
 * is added on top, worked out per GST rate and rounded half-up to the paisa. Big numbers go
 * through BigInt so a 500-unit order of a costly item can't lose a paisa to floating point.
 * Pure code: the pricing sheet runs it in the browser for live totals, the server to store.
 */

export const LIMITS = {
  lines: 200,
  quantity: 100_000,
  unitPricePaise: 10_000_000,
  linePaise: 1_000_000_000,
  totalPaise: 10_000_000_000,
} as const;

/** n / d rounded half-up, for n ≥ 0 and d > 0. */
export const halfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);

/** A price that includes GST, with the GST taken out. */
export const exGst = (inclusivePaise: number, ratePercent: number) =>
  Number(halfUp(BigInt(inclusivePaise) * 100n, BigInt(100 + ratePercent)));

/**
 * Where a quotation line's price starts. The school price is already before GST. Shop prices
 * include GST, so the GST comes out first, or the school would pay it twice; with no rate
 * known yet the shop price is used and flagged for the owner to check.
 */
export function startingUnitPrice(line: {
  schoolPricePaise?: number | null;
  shopPricePaise: number;
  gstRatePercent?: number | null;
}): { unitPricePaise: number; from: "school" | "shop-ex-gst" | "shop-check-rate" } {
  if (line.schoolPricePaise != null) return { unitPricePaise: line.schoolPricePaise, from: "school" };
  if (line.gstRatePercent != null)
    return { unitPricePaise: exGst(line.shopPricePaise, line.gstRatePercent), from: "shop-ex-gst" };
  return { unitPricePaise: line.shopPricePaise, from: "shop-check-rate" };
}

export type Discount =
  | { type: "none" }
  | { type: "percent"; percent: number }
  | { type: "amount"; paise: number };

/** The discount on a subtotal, never more than the subtotal. */
export function discountPaiseFor(subtotalPaise: number, discount: Discount) {
  if (discount.type === "percent")
    return Number(halfUp(BigInt(subtotalPaise) * BigInt(discount.percent), 100n));
  if (discount.type === "amount") return Math.min(discount.paise, subtotalPaise);
  return 0;
}

/**
 * Shares `total` across lines in proportion to their weights, in whole paise that always add
 * back up to `total`: each line gets its floor, and the paise left over go to the largest
 * remainders (the earlier line on a tie).
 */
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((n, w) => n + BigInt(w), 0n);
  if (!total || !sum) return weights.map(() => 0);
  const exact = weights.map((w) => BigInt(total) * BigInt(w));
  const shares = exact.map((e) => e / sum);
  let left = BigInt(total) - shares.reduce((n, s) => n + s, 0n);
  const order = exact
    .map((e, index) => ({ index, remainder: e % sum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of order) {
    if (left <= 0n) break;
    shares[index] += 1n;
    left -= 1n;
  }
  return shares.map(Number);
}

export type Supply = "intra" | "inter";
/** Within one state: CGST + SGST. To another state: IGST. An unknown buyer state counts as the shop's. */
export const supplyType = (shopState: string, buyerState?: string | null): Supply =>
  !buyerState || buyerState === shopState ? "intra" : "inter";

export type QuoteLineInput = { quantity: number; unitPricePaise: number; gstRatePercent: number };
export type TaxRow = {
  ratePercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};
export type QuoteTotals = {
  lines: { amountPaise: number; discountPaise: number; taxablePaise: number }[];
  units: number;
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxes: TaxRow[];
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

/** Every figure a quotation shows, from its lines, discount and supply type. */
export function quoteTotals(lines: QuoteLineInput[], discount: Discount, supply: Supply): QuoteTotals {
  const amounts = lines.map((line) => Number(BigInt(line.quantity) * BigInt(line.unitPricePaise)));
  const subtotalPaise = amounts.reduce((n, a) => n + a, 0);
  const discountPaise = discountPaiseFor(subtotalPaise, discount);
  const shares = allocate(discountPaise, amounts);
  const perLine = amounts.map((amountPaise, i) => ({
    amountPaise,
    discountPaise: shares[i],
    taxablePaise: amountPaise - shares[i],
  }));
  const byRate = new Map<number, number>();
  lines.forEach((line, i) =>
    byRate.set(line.gstRatePercent, (byRate.get(line.gstRatePercent) ?? 0) + perLine[i].taxablePaise),
  );
  const taxes = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ratePercent, taxablePaise]): TaxRow => {
      const base = BigInt(taxablePaise) * BigInt(ratePercent);
      // each half is rounded on its own, so CGST and SGST always match
      const half = supply === "intra" ? Number(halfUp(base, 200n)) : 0;
      return {
        ratePercent,
        taxablePaise,
        cgstPaise: half,
        sgstPaise: half,
        igstPaise: supply === "inter" ? Number(halfUp(base, 100n)) : 0,
      };
    });
  const sum = (key: "cgstPaise" | "sgstPaise" | "igstPaise") => taxes.reduce((n, t) => n + t[key], 0);
  const taxablePaise = subtotalPaise - discountPaise;
  const cgstPaise = sum("cgstPaise");
  const sgstPaise = sum("sgstPaise");
  const igstPaise = sum("igstPaise");
  return {
    lines: perLine,
    units: lines.reduce((n, line) => n + line.quantity, 0),
    subtotalPaise,
    discountPaise,
    taxablePaise,
    taxes,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise: taxablePaise + cgstPaise + sgstPaise + igstPaise,
  };
}

/** A quotation is good through the whole of its last day, India time. */
export const isExpired = (validUntil: string, now = new Date()) => istDate(now) > validUntil;

/** Today plus `days`, India time, as YYYY-MM-DD. */
export function istDatePlus(days: number, now = new Date()) {
  const date = new Date(`${istDate(now)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** AGSQ-20261002-00001: a quotation's number, apart from order numbers (AGS-…). */
export const quoteNumber = (day: string, sequence: number) =>
  `AGSQ-${day}-${String(sequence).padStart(5, "0")}`;
