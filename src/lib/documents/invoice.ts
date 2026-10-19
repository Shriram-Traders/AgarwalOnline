import { formatIst, paymentLabel } from "../display";
import { lineNotes, type PackedLine } from "../operations/packing";
import { rupeesInWords } from "../money-words";
import type { SectionValues } from "../settings/shop";

export type InvoiceLine = PackedLine & {
  variantId?: unknown;
  name: string;
  label: string;
  quantity: number;
  pricePaise: number;
  linePaise: number;
};
export type InvoiceOrder = {
  number: string;
  createdAt: Date | string;
  items: InvoiceLine[];
  address: { name?: string; phone?: string; line?: string; areaName?: string; pin?: string };
  /** Who the bill is made out to, when staff changed it from the delivery name, and their GSTIN. */
  bill?: { name?: string; gstin?: string } | null;
  deliveryDate?: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  codStatus?: string;
  subtotalPaise: number;
  merchandiseSavingsPaise?: number;
  promotionDiscountPaise?: number;
  appliedPromotion?: { code?: string; name?: string } | null;
  deliveryPaise: number;
  totalPaise: number;
  originalTotalPaise?: number | null;
  shortfallPaise?: number | null;
};
/** What a line's product says today: MRP, HSN code and GST rate. Orders don't keep them. */
export type LineFacts = { mrpPaise?: number; hsnCode?: string; gstRatePercent?: number };
export type Seller = { legalName: string; address?: string; phone?: string; email?: string; gstin?: string };

/**
 * GST inside GST-inclusive prices, the way the shop sells: the offer's discount spread over the
 * lines by value, each line's tax backed out at its rate (taxable = amount ÷ (1 + rate)), and
 * delivery taxed at the highest rate on the bill (a mixed supply; worth confirming with the CA).
 * Tax is rounded per line to the paisa; CGST takes the odd paisa of a rate's tax, SGST the rest.
 * A line with no rate set has no tax worked out and is listed in `missing`.
 */
export function inclusiveTax(
  lines: { linePaise: number; rate: number | null }[],
  discountPaise: number,
  deliveryPaise: number,
) {
  const gross = lines.reduce((sum, line) => sum + line.linePaise, 0);
  let left = Math.min(discountPaise, gross);
  const split = (net: number, rate: number | null) => {
    const tax = rate == null ? 0 : Math.round((net * rate) / (100 + rate));
    return { net, rate, tax, taxable: net - tax };
  };
  const rows = lines.map((line, index) => {
    const share =
      index === lines.length - 1 ? left : gross ? Math.round((Math.min(discountPaise, gross) * line.linePaise) / gross) : 0;
    left -= share;
    return split(line.linePaise - share, line.rate);
  });
  const rated = lines.map((line) => line.rate).filter((rate): rate is number => rate != null);
  const delivery = deliveryPaise ? split(deliveryPaise, rated.length ? Math.max(...rated) : 0) : null;
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const row of [...rows, ...(delivery ? [delivery] : [])]) {
    if (row.rate == null) continue;
    const sums = byRate.get(row.rate) ?? { taxable: 0, tax: 0 };
    byRate.set(row.rate, { taxable: sums.taxable + row.taxable, tax: sums.tax + row.tax });
  }
  const summary = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, sums]) => {
      const cgst = Math.ceil(sums.tax / 2);
      return { rate, taxable: sums.taxable, cgst, sgst: sums.tax - cgst };
    });
  return {
    rows,
    delivery,
    summary,
    taxable: summary.reduce((sum, row) => sum + row.taxable, 0),
    cgst: summary.reduce((sum, row) => sum + row.cgst, 0),
    sgst: summary.reduce((sum, row) => sum + row.sgst, 0),
    missing: lines.map((line, index) => (line.rate == null ? index : -1)).filter((index) => index >= 0),
  };
}

const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
/** Bills show paise, with Indian digit grouping: ₹1,234.00. */
const money = (paise: number) => inr.format(paise / 100);
const dateOnly = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const PAGE = {
  a4: "@page{size:A4;margin:14mm}body{font-size:14px;max-width:780px}",
  a5: "@page{size:A5;margin:9mm}body{font-size:12px;max-width:560px}",
  receipt:
    "@page{size:80mm auto;margin:4mm}body{font-size:11.5px;max-width:300px;padding:0 6px}header,.parties{flex-direction:column;gap:8px}.doc{text-align:left}.wide{display:none}.totals{width:100%}th,td{padding:5px 3px}",
} as const;

export type BillKind = "cash-memo" | "tax-invoice" | "tax-invoice-cum-bill-of-supply" | "estimate";
const HEADINGS: Record<BillKind, string> = {
  "cash-memo": "Cash memo",
  "tax-invoice": "Tax invoice",
  "tax-invoice-cum-bill-of-supply": "Tax invoice-cum-bill of supply",
  estimate: "Estimate",
};

/**
 * Which document this is. It follows the shop's GST status, not a choice per order: a cash memo
 * with no GSTIN; a tax invoice with one, or an invoice-cum-bill of supply when 0% items (most
 * school stationery since Sept 2025) are on the bill of a buyer without a GSTIN (Rule 46A).
 */
export function billKind({
  estimate,
  sellerGstin,
  buyerGstin,
  rates,
}: {
  estimate: boolean;
  sellerGstin?: string;
  buyerGstin?: string;
  rates: (number | null)[];
}): BillKind {
  if (estimate) return "estimate";
  if (!sellerGstin) return "cash-memo";
  return !buyerGstin && rates.some((rate) => rate === 0) && rates.some((rate) => rate != null && rate > 0)
    ? "tax-invoice-cum-bill-of-supply"
    : "tax-invoice";
}

/**
 * The customer's bill (or a staff estimate) as one HTML page. What the law asks of each kind is
 * always printed; Customize → Bills decides the rest (logo, customer phone, payment line, MRP and
 * savings, total in words, thank-you, terms, footer, signature, paper, colour, page or download).
 */
export function renderInvoice({
  order,
  seller,
  stateName,
  number,
  replaces,
  date,
  bill,
  refund,
  facts,
  origin,
  sample = false,
  estimate = false,
  staffView = false,
}: {
  order: InvoiceOrder;
  /** The shop as the bill was issued (kept on the order at delivery), or as it is now. */
  seller: Seller;
  /** The shop's state, "Maharashtra (27)": deliveries are local, so it is also the place of supply. */
  stateName: string;
  /** The bill's number (or the estimate's). */
  number: string;
  /** A re-issued bill: the number it replaces. */
  replaces?: string | null;
  /** When the bill was issued: delivery; until then, the order date. */
  date: Date | string;
  bill: SectionValues<"bill">;
  /** Where the refund for an online payment's unpacked items stands, if there is one. */
  refund?: "refunded" | "under-way" | "owed" | null;
  facts: Map<string, LineFacts>;
  origin: string;
  sample?: boolean;
  /** A kaccha bill: the lines and totals, before delivery, clearly not a bill. */
  estimate?: boolean;
  /** Staff are looking: say what is missing for a correct bill (customers never see this). */
  staffView?: boolean;
}) {
  const cash = order.paymentMethod === "cod";
  const factOf = (line: InvoiceLine) => facts.get(String(line.variantId)) ?? {};
  const rates = order.items.map((line) => factOf(line).gstRatePercent ?? null);
  const kind = billKind({ estimate, sellerGstin: seller.gstin, buyerGstin: order.bill?.gstin, rates });
  const taxed = kind === "tax-invoice" || kind === "tax-invoice-cum-bill-of-supply";
  const tax = taxed
    ? inclusiveTax(
        order.items.map((line, index) => ({ linePaise: line.linePaise, rate: rates[index] })),
        order.promotionDiscountPaise ?? 0,
        order.deliveryPaise,
      )
    : null;
  const accent = /^#[0-9a-f]{6}$/i.test(bill.accent) ? bill.accent : "#1e3a8a";
  const page = PAGE[bill.paper as keyof typeof PAGE] ?? PAGE.a4;

  // the shop: name, address and a customer-care contact always; its GSTIN on a tax invoice only
  const careLine = [seller.phone && `Phone ${seller.phone}`, seller.email].filter(Boolean).join(" · ");
  const shopLine = [seller.address, seller.phone && `Phone ${seller.phone}`, taxed && seller.gstin && `GSTIN ${seller.gstin}`, seller.email]
    .filter(Boolean)
    .join(" · ");
  const logo = bill.showLogo ? `<img class="logo" src="${escape(origin)}/icons/icon-192.png" alt="">` : "";
  const doc = [
    `<strong>${HEADINGS[kind]}</strong>`,
    taxed ? '<span class="tag">Original for recipient</span>' : "",
    `<span>${kind === "estimate" ? "Estimate no." : "Bill no."} ${escape(number)}</span>`,
    `<span>Date ${escape(dateOnly(date))}</span>`,
    `<span class="muted">Order ${escape(order.number)}</span>`,
    kind === "estimate" && order.deliveryDate ? `<span>Valid until ${escape(dateOnly(order.deliveryDate))}</span>` : "",
  ].join("");

  // who it's for, and where it went: two blocks, as the consumer rules ask
  const billTo = [
    `<strong>${escape(order.bill?.name || order.address.name)}</strong>`,
    taxed && order.bill?.gstin ? `GSTIN ${escape(order.bill.gstin)}` : "",
    taxed ? `State: ${escape(stateName)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const shipTo = [
    escape(order.address.name),
    escape(order.address.line),
    `${escape(order.address.areaName)} ${escape(order.address.pin)}`,
    bill.showCustomerPhone && order.address.phone ? `Phone ${escape(order.address.phone)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const facts1 = [
    taxed ? `Place of supply: ${escape(stateName)}` : "",
    taxed ? "Reverse charge: No" : "",
    bill.showPayment && kind !== "estimate" ? escape(paymentLabel(order)) : "",
    `Ordered ${escape(formatIst(order.createdAt))}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const head = [
    "<th>Item</th>",
    taxed ? '<th class="wide">HSN</th>' : "",
    "<th>Qty</th>",
    bill.showMrp ? '<th class="wide">MRP</th>' : "",
    '<th class="wide">Price</th>',
    taxed ? '<th class="wide">Taxable value</th><th>GST</th>' : "",
    "<th>Amount</th>",
  ].join("");
  const rows = order.items
    .map((line, index) => {
      const { mrpPaise, hsnCode } = factOf(line);
      const notes = lineNotes(line, cash)
        .map((note) => `<small class="note">${escape(note)}</small>`)
        .join("");
      const row = tax?.rows[index];
      return [
        `<tr><td>${escape(line.name)}<small>${escape(line.label)}</small>${notes}</td>`,
        taxed ? `<td class="wide">${escape(hsnCode || "–")}</td>` : "",
        `<td>${line.quantity}</td>`,
        bill.showMrp ? `<td class="wide">${mrpPaise ? money(mrpPaise) : "–"}</td>` : "",
        `<td class="wide">${money(line.pricePaise)}</td>`,
        taxed && row ? `<td class="wide">${money(row.taxable)}</td><td>${row.rate == null ? "–" : `${row.rate}%`}</td>` : "",
        `<td>${money(line.linePaise)}</td></tr>`,
      ].join("");
    })
    .join("");

  const offerName = order.appliedPromotion?.code || order.appliedPromotion?.name;
  const totals = [
    `<p><span>Items</span><strong>${money(order.subtotalPaise)}</strong></p>`,
    order.promotionDiscountPaise
      ? `<p><span>Discount${offerName ? ` (${escape(offerName)})` : ""}</span><strong>−${money(order.promotionDiscountPaise)}</strong></p>`
      : "",
    `<p><span>Delivery</span><strong>${order.deliveryPaise ? money(order.deliveryPaise) : "Free"}</strong></p>`,
    `<p class="grand"><span>${kind === "estimate" ? "Estimated total" : "Total"}</span><span>${money(order.totalPaise)}</span></p>`,
  ].join("");
  const gstTable = tax
    ? `<table class="gst"><caption>GST included in the total</caption><thead><tr><th>Rate</th><th>Taxable value</th><th>CGST</th><th>SGST</th></tr></thead><tbody>${tax.summary
        .map(
          (row) =>
            `<tr><td>${row.rate}%</td><td>${money(row.taxable)}</td><td>${money(row.cgst)} <small>(${row.rate / 2}%)</small></td><td>${money(row.sgst)} <small>(${row.rate / 2}%)</small></td></tr>`,
        )
        .join("")}<tr class="sum"><td>Total</td><td>${money(tax.taxable)}</td><td>${money(tax.cgst)}</td><td>${money(tax.sgst)}</td></tr></tbody></table>`
    : "";
  const saved = (order.merchandiseSavingsPaise ?? 0) + (order.promotionDiscountPaise ?? 0);
  const missingRates =
    staffView && tax?.missing.length
      ? `<p class="warn">GST rate not set on ${tax.missing.map((index) => escape(order.items[index].name)).join(", ")}: no tax is worked out for ${tax.missing.length === 1 ? "it" : "them"}. Set it on the product (Catalog → the product → Tax). Customers don’t see this line.</p>`
      : "";
  const notes = [
    order.originalTotalPaise != null
      ? `<p class="muted">Items that weren’t available were taken off this bill. Total as ordered: ${money(order.originalTotalPaise)}.</p>`
      : "",
    refund && order.shortfallPaise
      ? `<p class="muted">Paid online. ${money(order.shortfallPaise)} of this payment is for items that weren’t available${
          refund === "refunded" ? ", and it has been refunded." : refund === "under-way" ? "; that refund is under way." : "; the store arranges that refund separately."
        }</p>`
      : "",
    tax?.delivery && tax.delivery.rate ? `<p class="muted">Delivery is taxed at ${tax.delivery.rate}%, the highest rate on this bill.</p>` : "",
  ].join("");
  // what the law asks each kind to say about tax, at the foot
  const legal =
    kind === "cash-memo"
      ? "Not registered under GST – no GST charged."
      : kind === "estimate"
        ? "This estimate is not a bill and not a tax invoice. The bill comes with the delivery."
        : "Prices include GST.";

  const style = `*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:28px auto;padding:0 22px;line-height:1.45}${page}header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid ${accent};padding-bottom:16px}.shop{display:flex;gap:14px;align-items:flex-start}.logo{width:52px;height:52px;border-radius:12px}h1{font-size:1.6em;margin:0;color:${accent}}.doc{display:grid;gap:2px;text-align:right;align-content:start}.doc strong{font-size:1.2em;color:${accent};text-transform:uppercase;letter-spacing:.02em}.tag{font-size:.75em;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.muted,small{color:#5b6472}small{display:block;margin-top:3px}.parties{display:flex;gap:16px;margin:18px 0 6px}.parties>div{flex:1;padding:10px 12px;border:1px solid #e5e8ee;border-radius:8px}.parties h2{margin:0 0 4px;font-size:.78em;letter-spacing:.06em;text-transform:uppercase;color:#5b6472}table{width:100%;border-collapse:collapse;margin:20px 0}caption{text-align:left;font-weight:700;margin-bottom:6px}th{text-align:left;font-size:.82em;color:#5b6472;border-bottom:2px solid ${accent}}th,td{padding:9px 7px;border-bottom:1px solid #e5e8ee;vertical-align:top}th:last-child,td:last-child{text-align:right}.gst{max-width:520px;margin-left:auto}.gst td,.gst th{text-align:right}.gst td:first-child,.gst th:first-child{text-align:left}.gst .sum td{font-weight:700;border-top:2px solid #0f172a}.totals{margin-left:auto;width:320px;max-width:100%}.totals p{display:flex;justify-content:space-between;margin:6px 0}.grand{font-size:1.25em;font-weight:700;border-top:2px solid #0f172a;padding-top:10px}.words{text-align:right;font-style:italic;color:#3f4555}.saved{color:#047857;font-weight:700;text-align:right}small.note{color:#9a3412;font-weight:600}.thanks{margin-top:24px;font-weight:700;color:${accent}}.terms{margin-top:14px;white-space:pre-line;font-size:.9em}.terms strong{display:block}.sign{margin:52px 0 0 auto;width:240px;max-width:100%;text-align:center;border-top:1px solid #0f172a;padding-top:6px;font-size:.9em}.legal{margin-top:20px;font-weight:700}.foot{margin-top:10px;font-size:.85em}.print,.sample,.estimate,.revised,.warn{display:block;margin:0 0 18px}.print{padding:10px 18px;border:0;border-radius:10px;background:${accent};color:#fff;font:600 15px Arial;cursor:pointer}.sample{padding:10px 14px;border-radius:10px;background:#fef3c7;color:#854d0e;font-weight:600}.warn{padding:10px 14px;border-radius:10px;background:#fbe8ec;color:#a11d33;font-weight:600}.estimate{padding:12px 14px;border:2px dashed #a11d33;border-radius:10px;color:#a11d33;font-weight:700;text-align:center;text-transform:uppercase}.revised{font-weight:700}@media print{body{margin:0 auto}.print,.sample,.warn{display:none}}`;
  const parts = [
    sample ? '<p class="sample">Sample bill: how a bill looks with the settings saved now. The order and items are made up from your catalogue.</p>' : "",
    missingRates,
    bill.openAs === "page" ? '<button class="print" type="button" onclick="window.print()">Print or save as PDF</button>' : "",
    kind === "estimate" ? '<p class="estimate">Estimate – not a bill / not a tax invoice</p>' : "",
    replaces ? `<p class="revised">Revised bill: replaces bill no. ${escape(replaces)}</p>` : "",
    `<header><div class="shop">${logo}<div><h1>${escape(seller.legalName)}</h1>${shopLine ? `<span class="muted">${escape(shopLine)}</span>` : ""}</div></div><div class="doc">${doc}</div></header>`,
    `<div class="parties"><div><h2>Bill to</h2>${billTo}</div><div><h2>Ship to</h2>${shipTo}</div></div>`,
    `<p class="muted">${facts1}</p>`,
    `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
    `<div class="totals">${totals}</div>`,
    bill.amountInWords ? `<p class="words">${escape(rupeesInWords(order.totalPaise))}</p>` : "",
    bill.showMrp && saved > 0 && kind !== "estimate" ? `<p class="saved">You saved ${money(saved)} on this order</p>` : "",
    gstTable,
    notes,
    `<p class="legal">${legal}</p>`,
    careLine ? `<p class="muted">Customer care: ${escape(careLine)}</p>` : "",
    bill.thankYou && kind !== "estimate" ? `<p class="thanks">${escape(bill.thankYou)}</p>` : "",
    bill.terms ? `<div class="terms"><strong>Terms</strong>${escape(bill.terms)}</div>` : "",
    bill.showSignature && kind !== "estimate"
      ? `<p class="sign">${escape(bill.signatureLabel)}<br><small>For ${escape(seller.legalName)}</small></p>`
      : "",
    bill.footerNote ? `<p class="muted foot">${escape(bill.footerNote)}</p>` : "",
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(HEADINGS[kind])} ${escape(number)}</title><style>${style}</style></head><body>${parts.join("")}</body></html>`;
}
