import { describe, expect, it } from "vitest";
import { billKind, inclusiveTax, renderInvoice, type InvoiceOrder } from "../src/lib/documents/invoice";
import { defaultsOf, readValues } from "../src/lib/settings/shop";

describe("GST inside GST-inclusive prices", () => {
  it("backs the tax out of each line and taxes delivery at the highest rate", () => {
    const tax = inclusiveTax(
      [
        { linePaise: 11800, rate: 18 },
        { linePaise: 5000, rate: 0 },
      ],
      0,
      3000,
    );
    expect(tax.rows.map((row) => [row.taxable, row.tax])).toEqual([
      [10000, 1800],
      [5000, 0],
    ]);
    expect(tax.delivery).toEqual({ net: 3000, rate: 18, tax: 458, taxable: 2542 });
    expect(tax.summary).toEqual([
      { rate: 0, taxable: 5000, cgst: 0, sgst: 0 },
      { rate: 18, taxable: 12542, cgst: 1129, sgst: 1129 },
    ]);
    // the parts add back up to what the customer pays
    expect(tax.taxable + tax.cgst + tax.sgst).toBe(11800 + 5000 + 3000);
  });

  it("spreads an offer's discount over the lines by value", () => {
    const tax = inclusiveTax(
      [
        { linePaise: 10000, rate: 5 },
        { linePaise: 5000, rate: 5 },
      ],
      1500,
      0,
    );
    expect(tax.rows.map((row) => row.net)).toEqual([9000, 4500]);
    expect(tax.delivery).toBeNull();
  });

  it("works out no tax for a line without a rate, and says so", () => {
    const tax = inclusiveTax(
      [
        { linePaise: 10000, rate: null },
        { linePaise: 10500, rate: 5 },
      ],
      0,
      0,
    );
    expect(tax.missing).toEqual([0]);
    expect(tax.summary).toEqual([{ rate: 5, taxable: 10000, cgst: 250, sgst: 250 }]);
  });
});

describe("which document a bill is", () => {
  it("follows the shop's GST status", () => {
    expect(billKind({ estimate: false, rates: [18] })).toBe("cash-memo");
    expect(billKind({ estimate: false, sellerGstin: "27ABCDE1234F1Z5", rates: [18, 5] })).toBe("tax-invoice");
    expect(billKind({ estimate: false, sellerGstin: "27ABCDE1234F1Z5", rates: [18, 0] })).toBe("tax-invoice-cum-bill-of-supply");
    expect(billKind({ estimate: false, sellerGstin: "27ABCDE1234F1Z5", buyerGstin: "27AAAAA0000A1Z5", rates: [18, 0] })).toBe(
      "tax-invoice",
    );
    expect(billKind({ estimate: true, sellerGstin: "27ABCDE1234F1Z5", rates: [18] })).toBe("estimate");
  });
});

const order: InvoiceOrder = {
  number: "AGS-20261019-00001",
  createdAt: new Date("2026-10-19T10:00:00+05:30"),
  items: [
    { variantId: "v1", name: "Classmate notebook", label: "172 pages", quantity: 2, pricePaise: 5900, linePaise: 11800 },
    { variantId: "v2", name: "Apsara pencils", label: "Pack of 10", quantity: 1, pricePaise: 5000, linePaise: 5000 },
  ],
  address: { name: "Kalpana S.", phone: "9876543210", line: "Main Road", areaName: "Nagothane", pin: "402106" },
  deliveryDate: "2026-10-20",
  paymentMethod: "cod",
  paymentStatus: "pending",
  orderStatus: "confirmed",
  subtotalPaise: 16800,
  deliveryPaise: 3000,
  totalPaise: 19800,
};
const facts = new Map([
  ["v1", { gstRatePercent: 18, hsnCode: "4820", mrpPaise: 6500 }],
  ["v2", { gstRatePercent: 0, hsnCode: "9609" }],
]);
const render = (gstin: string | undefined, extra: Partial<Parameters<typeof renderInvoice>[0]> = {}) =>
  renderInvoice({
    order,
    seller: { legalName: "Agarwal Online", address: "Main Road, Nagothane", phone: "9000000000", gstin },
    stateName: "Maharashtra (27)",
    number: "20261019-00001",
    date: order.createdAt,
    bill: defaultsOf("bill"),
    facts,
    origin: "https://agarwalonline.in",
    ...extra,
  });

describe("the printed bill", () => {
  it("as a cash memo: no GST anywhere, both addresses and a customer-care contact", () => {
    const html = render(undefined);
    expect(html).toContain("<strong>Cash memo</strong>");
    expect(html).toContain("<h1>Agarwal Online</h1>");
    expect(html).toContain("Main Road, Nagothane · Phone 9000000000");
    expect(html).toContain("<h2>Bill to</h2>");
    expect(html).toContain("<h2>Ship to</h2>");
    expect(html).toContain("Customer care: Phone 9000000000");
    expect(html).toContain("Not registered under GST – no GST charged.");
    expect(html).toContain("Rupees One Hundred Ninety-Eight Only");
    expect(html).not.toMatch(/GSTIN|CGST|Tax invoice/);
  });

  it("as a tax invoice: the GSTIN, rates, CGST and SGST, and the words the rules ask for", () => {
    const html = render("27ABCDE1234F1Z5");
    expect(html).toContain("<strong>Tax invoice-cum-bill of supply</strong>");
    expect(html).toContain("GSTIN 27ABCDE1234F1Z5");
    expect(html).toContain("Original for recipient");
    expect(html).toContain("Reverse charge: No");
    expect(html).toContain("Place of supply: Maharashtra (27)");
    expect(html).toContain("GST included in the total");
    expect(html).toContain("Delivery is taxed at 18%");
    expect(html).not.toContain("Not registered under GST");
  });

  it("as an estimate: the boxed kaccha bill, marked as not a bill, valid until delivery, with no payment line", () => {
    const html = render("27ABCDE1234F1Z5", { estimate: true, number: "EST-AGS-20261019-00001" });
    expect(html).toContain('<div class="est">Estimate · not a bill / not a tax invoice</div>');
    expect(html).toContain("<b>Estimate no.</b><span>EST-AGS-20261019-00001</span>");
    expect(html).toContain("<b>Valid until</b><span>20 Oct 2026</span>");
    expect(html).toContain("Estimated total");
    expect(html).not.toContain("Pay cash on delivery");
    expect(html).not.toMatch(/CGST|>HSN<|Tax %/);
  });

  it("shows what the owner switched on", () => {
    const html = render(undefined, {
      bill: readValues("bill", {
        showLogo: true,
        showMrp: true,
        showCustomerPhone: true,
        showSignature: true,
        terms: "Exchange within 7 days.",
        paper: "receipt",
        amountInWords: false,
      }),
    });
    expect(html).toContain('<img class="logo" src="https://agarwalonline.in/icons/icon-192.png"');
    expect(html).toContain("<th class=\"wide\">MRP</th>");
    expect(html).toContain("Phone 9876543210");
    expect(html).toContain("Authorised signatory");
    expect(html).toContain("Exchange within 7 days.");
    expect(html).toContain("size:80mm auto");
    expect(html).not.toContain("Rupees");
  });

  it("tells staff, and only staff, which products have no GST rate", () => {
    const missing = new Map([["v1", { hsnCode: "4820" }]]);
    expect(render("27ABCDE1234F1Z5", { facts: missing, staffView: true })).toContain("GST rate not set on Classmate notebook");
    expect(render("27ABCDE1234F1Z5", { facts: missing })).not.toContain("GST rate not set");
  });
});

describe("the boxed bill styles", () => {
  const withMr = new Map([
    ["v1", { gstRatePercent: 18, hsnCode: "4820", mrpPaise: 6500, nameMr: "क्लासमेट वही" }],
    ["v2", { gstRatePercent: 0, hsnCode: "9609" }],
  ]);
  const styled = (
    style: string,
    gstin: string | undefined = "27ABCDE1234F1Z5",
    extra: Partial<Parameters<typeof renderInvoice>[0]> = {},
    more: Record<string, unknown> = {},
  ) => render(gstin, { facts: withMr, bill: readValues("bill", { style, ...more }), ...extra });

  it("Parchment ledger: the boxed tax invoice, with list price and discount from the MRP and the sale line", () => {
    const html = styled("ledger");
    expect(html).toContain('<div class="sheet">');
    expect(html).toContain("TAX INVOICE-CUM-BILL OF SUPPLY");
    expect(html).toContain('<span class="mono">A</span>');
    for (const head of ["Sr.", "Item", "HSN", "Qty", "List price", "Disc.", "Tax %", "Amount (₹)"]) expect(html).toContain(`>${head}</th>`);
    // 2 notebooks at ₹59 against an MRP of ₹65: listed at 65.00, ₹12.00 off, ₹118.00
    expect(html).toContain('<td class="n wide">65.00</td><td class="n wide">12.00</td><td class="n">18</td><td class="n">118.00</td>');
    expect(html).toContain("Sale @0% = 50.00 | Sale @18% = 125.42, CGST = 11.29, SGST = 11.29 | Total taxable = 175.42, Tax = 22.58");
    expect(html).toContain("Rupees One Hundred Ninety-Eight Only");
    expect(html).toContain("<b>Place of supply</b><span>Maharashtra (27)</span>");
    expect(html).toContain("<b>Reverse charge</b><span>No</span>");
    expect(html).toContain("For Agarwal Online");
    expect(html).toContain("Prices include GST.");
    expect(html).not.toContain("Bank and UPI");
  });

  it("Marathi and English: every label in both, the Marathi item name and the total in Marathi words", () => {
    const html = styled("bilingual");
    expect(html).toContain('<html lang="mr">');
    expect(html).toContain("कर बीजक तथा पुरवठा बिल");
    expect(html).toContain('अ.क्र. <span class="en">Sr.</span>');
    expect(html).toContain('नग <span class="en">Qty</span>');
    expect(html).toContain('<small><span lang="mr">क्लासमेट वही</span> · 172 pages</small>');
    expect(html).toContain('अक्षरी: <span lang="mr">एकशे अठ्ठ्याण्णव रुपये फक्त</span>');
    expect(html).toContain("In words: Rupees One Hundred Ninety-Eight Only");
    expect(html).toContain("अग्रवाल ऑनलाइनसाठी");
    expect(html).toContain("किमतींमध्ये जीएसटी समाविष्ट आहे.");
  });

  it("Shree festive: the toran, ॥ श्री ॥, शुभ and लाभ, and the greeting only when there is one", () => {
    const html = styled("shree");
    expect(html).toContain('<div class="toran" aria-hidden="true">');
    expect(html).toContain("॥ श्री ॥");
    expect(html).toContain('<div class="side shubh" lang="mr">शुभ</div>');
    expect(html).toContain('<div class="side shubh" lang="mr">लाभ</div>');
    expect(html).not.toContain('class="greet"');
    expect(styled("shree", "27ABCDE1234F1Z5", {}, { greeting: "शुभ दीपावली · Happy Diwali" })).toContain(
      '<div class="greet">शुभ दीपावली · Happy Diwali</div>',
    );
  });

  it("a cash memo in a boxed style has no GST anywhere", () => {
    // no GSTIN for the shop (styled's default has one)
    const html = render(undefined, { facts: withMr, bill: readValues("bill", { style: "ledger" }) });
    expect(html).toContain("CASH MEMO");
    expect(html).toContain("Not registered under GST – no GST charged.");
    expect(html).not.toMatch(/GSTIN|CGST|>HSN<|Tax %|Place of supply/);
  });

  it("the kaccha bill under Modern is the plain boxed one", () => {
    const html = render("27ABCDE1234F1Z5", { estimate: true, number: "EST-1" });
    expect(html).toContain('<div class="sheet">');
    expect(html).toContain('<th class="n">Rate</th>');
    expect(html).not.toContain("Bank and UPI");
  });

  it("prints bank and UPI details only when asked for and filled in", () => {
    const payment = { accountName: "Agarwal Online", bankName: "", accountNumber: "1234567890", ifsc: "SBIN0001234", upiId: "agarwal@upi" };
    const boxed = styled("ledger", "27ABCDE1234F1Z5", { payment }, { showBankDetails: true });
    expect(boxed).toContain("Bank and UPI");
    expect(boxed).toContain("Account number: 1234567890");
    expect(boxed).toContain("UPI: agarwal@upi");
    expect(boxed).not.toContain("Bank: ");
    expect(styled("ledger", "27ABCDE1234F1Z5", { payment })).not.toContain("Bank and UPI");
    expect(styled("ledger", "27ABCDE1234F1Z5", { payment: { upiId: "  " } }, { showBankDetails: true })).not.toContain("Bank and UPI");
    // the Modern bill shows them too
    expect(render("27ABCDE1234F1Z5", { payment, bill: readValues("bill", { showBankDetails: true }) })).toContain("UPI: agarwal@upi");
  });

  it("escapes whatever the shop typed", () => {
    const html = renderInvoice({
      order,
      seller: { legalName: "A & B <Stores>", address: "Main Road", phone: "9000000000", gstin: "27ABCDE1234F1Z5" },
      stateName: "Maharashtra (27)",
      number: "1",
      date: order.createdAt,
      bill: readValues("bill", { style: "shree", terms: "<script>alert(1)</script>", greeting: "<b>hi</b>" }),
      facts,
      origin: "https://agarwalonline.in",
    });
    expect(html).toContain("A &amp; B &lt;Stores&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps the narrow receipt on receipt paper", () => {
    const html = styled("ledger", "27ABCDE1234F1Z5", {}, { paper: "receipt" });
    expect(html).toContain("size:80mm auto");
    expect(html).not.toContain('<div class="sheet">');
  });
});
