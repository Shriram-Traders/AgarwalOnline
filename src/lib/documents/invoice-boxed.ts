import type { BillKind, PaymentDetails, Seller } from "./invoice";
import { amount, escape, money } from "./format";

/*
 * The classic Indian boxed bill: a ruled frame with the shop centred at the top, billing details beside
 * the bill's facts, item columns ruled down to the foot of the page, the total in words, a "Sale @18% =
 * …, CGST …, SGST …" line, and terms, bank and signature boxes along the bottom. Customize → Bills picks
 * the look; every kaccha bill uses it too. What a bill says (its kind, number, GST) is worked out in
 * invoice.ts: this file only lays it out.
 */

export type BoxedTheme = "plain" | "ledger" | "bilingual" | "shree";

type Look = { paper: string; ink: string; frame: string; rule: string; head: string; band: string; serif: boolean };
const LOOKS: Record<BoxedTheme, Look> = {
  // the kaccha bill under the Modern style: cream paper, grey ink
  plain: { paper: "#fffef5", ink: "#111827", frame: "#4b5563", rule: "#a8adb6", head: "#111827", band: "#f4f1e4", serif: true },
  // Parchment ledger: khaki paper like an old account book
  ledger: { paper: "#ece5c8", ink: "#2b2618", frame: "#6b6450", rule: "#8a8269", head: "#2b2618", band: "#e2d9b4", serif: true },
  // Marathi and English: cream paper, saffron lines
  bilingual: { paper: "#fff8ec", ink: "#2d1a0a", frame: "#c2410c", rule: "#f0b48a", head: "#9a3412", band: "#ffedd5", serif: false },
  // Shree festive: maroon frame, marigold toran
  shree: { paper: "#fffaf0", ink: "#3b0d0d", frame: "#7f1d1d", rule: "#d9a066", head: "#7f1d1d", band: "#fef3c7", serif: true },
};

/** The Marathi beside each English label on the Marathi and English bill. To be checked by a Marathi speaker. */
const MARATHI: Record<string, string> = {
  "Tax invoice": "कर बीजक",
  "Tax invoice-cum-bill of supply": "कर बीजक तथा पुरवठा बिल",
  "Cash memo": "रोख पावती",
  Estimate: "अंदाजपत्रक",
  "Original for recipient": "मूळ प्रत",
  "Billing details": "ग्राहक",
  "Bill no.": "बिल क्र.",
  "Estimate no.": "अंदाजपत्रक क्र.",
  Date: "दिनांक",
  "Valid until": "पर्यंत वैध",
  "Place of supply": "पुरवठ्याचे ठिकाण",
  "Reverse charge": "रिव्हर्स चार्ज",
  Payment: "पेमेंट",
  "Replaces bill no.": "बदललेले बिल क्र.",
  Order: "ऑर्डर",
  "Sr.": "अ.क्र.",
  Item: "वस्तू",
  Qty: "नग",
  "List price": "छापील किंमत",
  Rate: "दर",
  "Disc.": "सवलत",
  "Tax %": "जीएसटी %",
  "Amount (₹)": "रक्कम (₹)",
  Total: "एकूण",
  "Estimated total": "अंदाजे एकूण",
  "In words": "अक्षरी",
  "Terms and conditions": "अटी व शर्ती",
  "Bank and UPI": "बँक व UPI",
  "You saved": "तुमची बचत",
  "Prices include GST.": "किमतींमध्ये जीएसटी समाविष्ट आहे.",
  "Not registered under GST – no GST charged.": "जीएसटी नोंदणी नाही – जीएसटी आकारलेला नाही.",
  "This estimate is not a bill and not a tax invoice. The bill comes with the delivery.":
    "हे अंदाजपत्रक आहे, बिल किंवा कर बीजक नाही. बिल डिलिव्हरीसोबत येईल.",
};

export type BoxedLine = {
  name: string;
  nameMr?: string;
  label: string;
  quantity: number;
  pricePaise: number;
  /** The printed price before the shop's own discount: the MRP when it is higher, else the price. */
  listPaise: number;
  discountPaise: number;
  amountPaise: number;
  hsn?: string;
  rate: number | null;
  notes: string[];
};

export type BoxedBill = {
  theme: BoxedTheme;
  kind: BillKind;
  heading: string;
  taxed: boolean;
  seller: Seller;
  shopNameMr: string;
  stateName: string;
  number: string;
  replaces: string | null;
  date: string;
  orderNumber: string;
  validUntil: string | null;
  billTo: { name: string; gstin?: string };
  shipTo: { line: string; phone?: string };
  payment: string | null;
  lines: BoxedLine[];
  totals: { items: number; offer: number; offerName?: string; delivery: number; total: number };
  tax: { summary: { rate: number; taxable: number; cgst: number; sgst: number }[]; taxable: number; cgst: number; sgst: number } | null;
  words: string | null;
  wordsMr: string | null;
  /** Shown as "You saved …" when above 0. */
  saved: number;
  notes: string[];
  legal: string;
  terms: string;
  thankYou: string;
  footerNote: string;
  signature: string | null;
  bank: PaymentDetails | null;
  greeting: string;
  logo: string | null;
  paper: "a4" | "a5";
  printButton: boolean;
  sample: boolean;
  /** Staff only: products on the bill with no GST rate. */
  missingNames: string[];
};

type Column = { label: string; width: number; numeric?: boolean; wide?: boolean; cell: (line: BoxedLine, index: number) => string };

/** One bill (or kaccha bill) in the boxed layout, as a whole HTML page. */
export function renderBoxed(bill: BoxedBill) {
  const look = LOOKS[bill.theme];
  const two = bill.theme === "bilingual";
  // a label; on the Marathi and English bill, the Marathi first and the English after it
  const say = (en: string) => (two && MARATHI[en] ? `${escape(MARATHI[en])} <span class="en">${escape(en)}</span>` : escape(en));
  const estimate = bill.kind === "estimate";
  const a4 = bill.paper === "a4";

  const item: Column = {
    label: "Item",
    width: 0,
    cell: (line) =>
      [
        escape(line.name),
        // the Marathi name and the pack on one line, so a bill of a few items stays on one page
        two && line.nameMr && line.nameMr !== line.name
          ? `<small><span lang="mr">${escape(line.nameMr)}</span>${line.label ? ` · ${escape(line.label)}` : ""}</small>`
          : line.label
            ? `<small>${escape(line.label)}</small>`
            : "",
        ...line.notes.map((note) => `<small class="note">${escape(note)}</small>`),
      ].join(""),
  };
  const sr: Column = { label: "Sr.", width: 0, cell: (_, index) => String(index + 1) };
  const qty: Column = { label: "Qty", width: 0, numeric: true, cell: (line) => String(line.quantity) };
  const list: Column = { label: "List price", width: 0, numeric: true, wide: true, cell: (line) => amount(line.listPaise) };
  const disc: Column = { label: "Disc.", width: 0, numeric: true, wide: true, cell: (line) => amount(line.discountPaise) };
  const total: Column = { label: "Amount (₹)", width: 0, numeric: true, cell: (line) => amount(line.amountPaise) };
  const columns: Column[] = estimate
    ? [
        { ...sr, width: 7 },
        { ...item, width: 53 },
        { ...qty, width: 9 },
        { label: "Rate", width: 15, numeric: true, cell: (line) => amount(line.pricePaise) },
        { ...total, width: 16 },
      ]
    : bill.taxed
      ? [
          { ...sr, width: 5 },
          { ...item, width: 36 },
          { label: "HSN", width: 9, wide: true, cell: (line) => escape(line.hsn || "–") },
          { ...qty, width: 6 },
          { ...list, width: 11 },
          { ...disc, width: 10 },
          { label: "Tax %", width: 8, numeric: true, cell: (line) => (line.rate == null ? "–" : String(line.rate)) },
          { ...total, width: 15 },
        ]
      : [
          { ...sr, width: 6 },
          { ...item, width: 46 },
          { ...qty, width: 8 },
          { ...list, width: 13 },
          { ...disc, width: 12 },
          { ...total, width: 15 },
        ];
  const cls = (column: Column) => [column.numeric ? "n" : "", column.wide ? "wide" : ""].filter(Boolean).join(" ");
  const table = `<table><colgroup>${columns
    .map((column) => `<col style="width:${column.width}%"${column.wide ? ' class="wide"' : ""}>`)
    .join("")}</colgroup><thead><tr>${columns
    .map((column) => `<th class="${cls(column)}">${say(column.label)}</th>`)
    .join("")}</tr></thead><tbody>${bill.lines
    .map(
      (line, index) =>
        `<tr>${columns.map((column) => `<td class="${cls(column)}">${column.cell(line, index)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
  // empty ruled columns down to the foot of the page, like a printed bill book
  const filler = `<div class="fill" style="grid-template-columns:${columns.map((column) => `${column.width}%`).join(" ")}">${columns
    .map(() => "<div></div>")
    .join("")}</div>`;

  const seller = bill.seller;
  const shopLines = [
    seller.address,
    [seller.phone && `Mobile: ${seller.phone}`, seller.email].filter(Boolean).join(" · "),
    bill.taxed && seller.gstin ? `GSTIN ${seller.gstin}` : "",
  ]
    .filter(Boolean)
    .map((text) => `<div>${escape(text)}</div>`)
    .join("");
  const shopName = two
    ? `<span lang="mr">${escape(bill.shopNameMr)}</span> · ${escape(seller.legalName)}`
    : escape(seller.legalName);
  const mark = bill.logo
    ? `<img class="logo" src="${escape(bill.logo)}" alt="">`
    : `<span class="mono">${escape(seller.legalName.trim().charAt(0).toUpperCase())}</span>`;
  const sides =
    bill.theme === "ledger"
      ? [`<div class="side">${mark}</div>`, '<div class="side"></div>']
      : bill.theme === "shree"
        ? ['<div class="side shubh" lang="mr">शुभ</div>', '<div class="side shubh" lang="mr">लाभ</div>']
        : null;
  const shop = `<div class="shop${sides ? "" : " single"}">${sides?.[0] ?? ""}<div class="mid"><h1 class="${look.serif ? "serif" : ""}">${shopName}</h1>${shopLines}</div>${sides?.[1] ?? ""}</div>`;

  const kv = (label: string, value: string | null | undefined) =>
    value ? `<b>${say(label)}</b><span>${escape(value)}</span>` : "";
  const parties = `<div class="parties"><div><b class="label">${say("Billing details")}</b><div><strong>${escape(bill.billTo.name)}</strong></div>${
    bill.billTo.gstin ? `<div>GSTIN ${escape(bill.billTo.gstin)}</div>` : ""
  }${bill.taxed ? `<div>State: ${escape(bill.stateName)}</div>` : ""}${bill.shipTo.line ? `<div>${escape(bill.shipTo.line)}</div>` : ""}${
    bill.shipTo.phone ? `<div>Phone ${escape(bill.shipTo.phone)}</div>` : ""
  }</div><div class="kv">${[
    kv(estimate ? "Estimate no." : "Bill no.", bill.number),
    kv("Date", bill.date),
    kv("Valid until", bill.validUntil),
    kv("Order", bill.orderNumber),
    bill.taxed ? kv("Place of supply", bill.stateName) : "",
    bill.taxed ? kv("Reverse charge", "No") : "",
    kv("Payment", bill.payment),
    kv("Replaces bill no.", bill.replaces),
  ].join("")}</div></div>`;

  const t = bill.totals;
  const breakdown = [
    `Items ${money(t.items)}`,
    t.offer ? `Offer${t.offerName ? ` (${t.offerName})` : ""} −${money(t.offer)}` : "",
    `Delivery ${t.delivery ? money(t.delivery) : "free"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const totalRow = `<div class="total"><span><b>${say(estimate ? "Estimated total" : "Total")}</b> <small>${escape(breakdown)}</small></span><span class="sum">${money(t.total)}</span></div>`;

  const tax = bill.tax;
  const taxLine = tax
    ? [
        ...tax.summary.map((row) =>
          row.rate === 0
            ? `Sale @0% = ${amount(row.taxable)}`
            : `Sale @${row.rate}% = ${amount(row.taxable)}, CGST = ${amount(row.cgst)}, SGST = ${amount(row.sgst)}`,
        ),
        `Total taxable = ${amount(tax.taxable)}, Tax = ${amount(tax.cgst + tax.sgst)}`,
      ].join(" | ")
    : "";
  const words = [
    bill.wordsMr ? `<p><b>${escape(MARATHI["In words"])}: <span lang="mr">${escape(bill.wordsMr)}</span></b></p>` : "",
    bill.words ? `<p><b>${two ? "In words: " : ""}${escape(bill.words)}</b></p>` : "",
    taxLine ? `<p>${escape(taxLine)}</p>` : "",
    bill.saved ? `<p class="saved">${say("You saved")} ${money(bill.saved)}</p>` : "",
    ...bill.notes.map((note) => `<p class="muted">${escape(note)}</p>`),
    `<p class="legal">${two && MARATHI[bill.legal] ? `<span lang="mr">${escape(MARATHI[bill.legal])}</span> ` : ""}${escape(bill.legal)}</p>`,
  ].join("");

  const bank = bill.bank;
  const bankLines = bank
    ? [
        bank.accountName && `Name: ${bank.accountName}`,
        bank.bankName && `Bank: ${bank.bankName}`,
        bank.accountNumber && `Account number: ${bank.accountNumber}`,
        bank.ifsc && `IFSC: ${bank.ifsc}`,
        bank.upiId && `UPI: ${bank.upiId}`,
      ].filter(Boolean)
    : [];
  const boxes = [
    `<div class="pre"><b class="label">${say("Terms and conditions")}</b>E. &amp; O.E.${bill.terms ? `\n${escape(bill.terms)}` : ""}</div>`,
    bankLines.length && !estimate ? `<div class="pre"><b class="label">${say("Bank and UPI")}</b>${escape(bankLines.join("\n"))}</div>` : "",
    `<div class="sign"><b>${two ? `<span lang="mr">${escape(bill.shopNameMr)}साठी</span><br>` : ""}For ${escape(seller.legalName)}</b><span>${
      bill.signature ? escape(bill.signature) : ""
    }</span></div>`,
  ].filter(Boolean);
  const foot = `<div class="foot" style="grid-template-columns:repeat(${boxes.length},minmax(0,1fr))">${boxes.join("")}</div>`;
  const after = [
    bill.theme === "shree" && bill.greeting ? `<div class="greet">${escape(bill.greeting)}</div>` : "",
    bill.thankYou ? `<div class="thanks">${escape(bill.thankYou)}</div>` : "",
    bill.footerNote ? `<div class="muted">${escape(bill.footerNote)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  const toran =
    bill.theme === "shree"
      ? `<div class="toran" aria-hidden="true">${"<i></i>".repeat(24)}</div><div class="shree" lang="mr">॥ श्री ॥</div>`
      : "";
  const strip = `<div class="strip"><span>${bill.taxed ? say("Original for recipient") : ""}</span><strong>${
    two && MARATHI[bill.heading] ? `<span lang="mr">${escape(MARATHI[bill.heading])}</span> · ` : ""
  }${escape(bill.heading.toUpperCase())}</strong><span></span></div>`;
  const banner = estimate ? '<div class="est">Estimate · not a bill / not a tax invoice</div>' : "";

  const pageSize = a4 ? "A4" : "A5";
  const margin = a4 ? 10 : 7;
  const sheetHeight = a4 ? "297mm" : "210mm";
  const pageLabel = two ? '"पान " counter(page) " / " counter(pages) " · Page"' : '"Page " counter(page) " of " counter(pages)';
  const style = `*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,Helvetica,sans-serif;color:${look.ink};background:#f1f0eb;margin:24px auto;padding:0 16px;max-width:${a4 ? 820 : 600}px;font-size:${a4 ? 13 : 11}px;line-height:1.4}@page{size:${pageSize};margin:${margin}mm;@bottom-right{content:${pageLabel};font:10px Arial,sans-serif;color:#555}}.serif,.label,th{font-family:${look.serif ? 'Georgia,"Times New Roman",serif' : "Arial,Helvetica,sans-serif"}}.sheet{background:${look.paper};border:1.5px solid ${look.frame};display:flex;flex-direction:column;min-height:${a4 ? 1120 : 820}px}.strip{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;padding:5px 8px;border-bottom:1px solid ${look.frame}}.strip strong{font-weight:400;font-size:1.15em;letter-spacing:.05em;color:${look.head};text-align:center}.strip span:last-child{text-align:right}.est{margin:8px;border:2px dashed #a11d33;color:#a11d33;text-align:center;padding:7px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.shop{display:grid;grid-template-columns:84px 1fr 84px;border-bottom:1px solid ${look.frame}}.shop.single{grid-template-columns:1fr}.mid{text-align:center;padding:7px 8px;line-height:1.5}h1{margin:0 0 2px;font-size:1.6em;color:${look.head}}.side{display:grid;place-items:center;padding:6px}.side:first-child{border-right:1px solid ${look.rule}}.side:last-child{border-left:1px solid ${look.rule}}.mono,.logo{width:56px;height:56px;border-radius:50%}.mono{border:2px solid ${look.head};display:grid;place-items:center;font:24px Georgia,serif;color:${look.head}}.shubh{color:#b91c1c;font-size:1.3em}.parties{display:grid;grid-template-columns:1.25fr 1fr;border-bottom:1px solid ${look.frame}}.parties>div{padding:6px 8px;line-height:1.55}.parties>div+div{border-left:1px solid ${look.rule}}.kv{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-content:start}.kv>span::before{content:": "}.two th .en{display:block;font-size:.82em}.two .kv b{white-space:nowrap}.two .kv .en{font-size:.82em}.two .parties{grid-template-columns:1fr 1.3fr}.label{display:block}.en{font-weight:400;opacity:.8}.items{flex:1;display:flex;flex-direction:column}table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}th{text-align:left;font-weight:700;background:${look.band};border-bottom:1px solid ${look.frame};padding:5px;vertical-align:bottom;line-height:1.25}td{padding:5px;vertical-align:top}th+th,td+td{border-left:1px solid ${look.rule}}.n{text-align:right}small{display:block;opacity:.75}small.note{opacity:1;color:#9a3412;font-weight:600}.fill{flex:1;display:grid;min-height:${a4 ? 30 : 6}px}.fill div+div{border-left:1px solid ${look.rule}}.total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 8px;border-top:1.5px solid ${look.frame};background:${look.band}}.total small{display:inline;opacity:.8}.sum{font-size:1.3em;font-weight:700;white-space:nowrap}.words{padding:6px 8px;border-top:1.5px solid ${look.frame}}.words p{margin:2px 0}.saved{color:#047857;font-weight:700}.legal{font-weight:700}.muted{opacity:.8}.foot{display:grid;border-top:1.5px solid ${look.frame}}.foot>div{padding:6px 8px;line-height:1.5}.foot>div+div{border-left:1px solid ${look.rule}}.pre{white-space:pre-line}.sign{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;text-align:right;min-height:${a4 ? 100 : 76}px}.greet,.thanks,.foot+div{text-align:center}.greet{color:#b91c1c;font-size:1.1em}.thanks{font-weight:700;color:${look.head}}div.after{border-top:1px solid ${look.frame};padding:5px 8px;display:grid;gap:2px;text-align:center}.toran{display:flex;justify-content:space-around;padding:0 6px;border-top:6px solid #15803d}.toran i{width:14px;height:17px;border-radius:0 0 50% 50%;background:#f59e0b}.toran i:nth-child(even){background:#ea580c}.shree{text-align:center;color:#b91c1c;font-size:1.15em;margin-top:2px}.print,.sample,.warn{display:block;margin:0 0 14px;font-family:Arial,sans-serif}.print{padding:10px 18px;border:0;border-radius:10px;background:${look.head};color:#fff;font-weight:700;font-size:15px;cursor:pointer}.sample{padding:10px 14px;border-radius:10px;background:#fef3c7;color:#854d0e;font-weight:700}.warn{padding:10px 14px;border-radius:10px;background:#fbe8ec;color:#a11d33;font-weight:700}${a4 ? "" : "th,td{padding:3px 4px}.parties>div,.foot>div,.words,.total,.mid{padding:4px 6px}h1{font-size:1.35em}.sign{min-height:56px}"}@media print{body{margin:0;padding:0;max-width:none;background:none}.print,.sample,.warn{display:none}.sheet{min-height:calc(${sheetHeight} - ${2 * margin}mm - 6mm)}}@media screen and (max-width:640px){body{margin:10px auto;padding:0 6px;font-size:11.5px}.sheet{min-height:0}.strip{grid-template-columns:1fr;text-align:center}.strip span:last-child{text-align:center}.shop{grid-template-columns:1fr}.side{display:none}.parties,.foot{grid-template-columns:1fr!important}.parties>div+div,.foot>div+div{border-left:0;border-top:1px solid ${look.rule}}.items table{table-layout:auto}.items col{width:auto!important}.wide,.fill{display:none}.sign{min-height:60px}}`;

  const parts = [
    bill.sample ? '<p class="sample">Sample bill: how a bill looks with the settings saved now. The order and items are made up from your catalogue.</p>' : "",
    bill.missingNames.length
      ? `<p class="warn">GST rate not set on ${bill.missingNames.map(escape).join(", ")}: no tax is worked out for ${
          bill.missingNames.length === 1 ? "it" : "them"
        }. Set it on the product (Catalog → the product → Tax). Customers don’t see this line.</p>`
      : "",
    bill.printButton ? '<button class="print" type="button" onclick="window.print()">Print or save as PDF</button>' : "",
    `<div class="sheet">${toran}${strip}${banner}${shop}${parties}<div class="items">${table}${filler}</div>${totalRow}<div class="words">${words}</div>${foot}${
      after ? `<div class="after">${after}</div>` : ""
    }</div>`,
  ];
  return `<!doctype html><html lang="${two ? "mr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(
    bill.heading,
  )} ${escape(bill.number)}</title><style>${style}</style></head><body${two ? ' class="two"' : ""}>${parts.join("")}</body></html>`;
}
