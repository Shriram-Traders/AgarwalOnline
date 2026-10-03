import type { Discount } from "./quote-math";

/** One line of the owner's pricing sheet as typed; the service checks each value and names the line. */
export type SheetLine = {
  variantId: string;
  quantity: number;
  unitPricePaise?: number;
  gstRatePercent: number;
  hsnCode?: string;
};
export type Sheet = { lines: SheetLine[]; discount: Discount; validUntil: string; note?: string };

const number = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : Number(text);
};

/**
 * Reads the pricing sheet from its form, after formWithPaise has turned every `…Rupees` box
 * into paise. Each line's boxes carry its pack id: qty_<id>, price_<id>Rupees, gst_<id>, hsn_<id>.
 */
export function sheetFromForm(fields: Record<string, unknown>): Sheet {
  const ids = Object.keys(fields).flatMap((key) => {
    const match = key.match(/^qty_([a-f\d]{24})$/i);
    return match ? [match[1]] : [];
  });
  const discountType = String(fields.discountType ?? "none");
  const discount: Discount =
    discountType === "percent"
      ? { type: "percent", percent: number(fields.discountPercent) ?? Number.NaN }
      : discountType === "amount"
        ? { type: "amount", paise: typeof fields.discountPaise === "number" ? fields.discountPaise : Number.NaN }
        : { type: "none" };
  return {
    lines: ids.map((id) => {
      const price = fields[`price_${id}Paise`];
      return {
        variantId: id,
        quantity: number(fields[`qty_${id}`]) ?? Number.NaN,
        unitPricePaise: typeof price === "number" ? price : undefined,
        gstRatePercent: number(fields[`gst_${id}`]) ?? Number.NaN,
        hsnCode: String(fields[`hsn_${id}`] ?? "").trim() || undefined,
      };
    }),
    discount,
    validUntil: String(fields.validUntil ?? ""),
    note: String(fields.note ?? "").trim() || undefined,
  };
}
