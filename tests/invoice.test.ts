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

  it("as an estimate: marked as not a bill, valid until delivery, with no payment line", () => {
    const html = render("27ABCDE1234F1Z5", { estimate: true, number: "EST-AGS-20261019-00001" });
    expect(html).toContain("Estimate – not a bill / not a tax invoice");
    expect(html).toContain("Estimate no. EST-AGS-20261019-00001");
    expect(html).toContain("Valid until 20 Oct 2026");
    expect(html).not.toContain("Pay cash on delivery");
    expect(html).not.toContain("CGST");
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
