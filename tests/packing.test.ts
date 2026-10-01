import { describe, expect, it } from "vitest";
import {
  billFollowsPacking,
  billForPacking,
  decideLine,
  inBagOf,
  lineNotes,
  notASubstitute,
  offerAfterPacking,
  packedOf,
  packingMessage,
  refundOwedNotice,
  reviewChecklist,
  shortfallRefund,
  waitingLabel,
} from "../src/lib/operations/packing";

const notebook = { name: "Notebook", label: "Single ruled", quantity: 3, pricePaise: 6000, linePaise: 18000 };
const pen = { name: "Gel pen", label: "Blue", quantity: 2, pricePaise: 2000, linePaise: 4000 };
const glue = { name: "Glue stick", label: "15 g", quantity: 1, pricePaise: 3000, linePaise: 3000 };

describe("Reading a packing checklist line", () => {
  it("needs a word about the rest when a line is packed short", () => {
    expect(decideLine(notebook, { packedQuantity: 3, missing: false })).toMatchObject({
      packed: 3,
      unavailable: 0,
      substituteQuantity: 0,
      waiting: false,
    });
    expect(decideLine(notebook, { packedQuantity: 2, missing: true })).toMatchObject({
      packed: 2,
      unavailable: 1,
      waiting: false,
    });
    expect(decideLine(notebook, { packedQuantity: 1, missing: false, substitution: " Navneet notebook " })).toMatchObject({
      packed: 1,
      unavailable: 0,
      substituteName: "Navneet notebook",
      substituteQuantity: 2,
    });
    // packed short with nothing said: still being packed, nothing on the order changes yet
    expect(decideLine(notebook, { packedQuantity: 2, missing: false })).toMatchObject({ waiting: true, unavailable: 0 });
  });

  it("names the line when the checklist contradicts itself", () => {
    expect(decideLine(notebook, { packedQuantity: 4, missing: false }).problem).toBe(
      "Packed quantity for Notebook (Single ruled) can’t be more than the 3 ordered.",
    );
    expect(decideLine(notebook, { packedQuantity: 3, missing: true }).problem).toMatch(/^Check Notebook \(Single ruled\): all 3/);
    expect(decideLine(notebook, { packedQuantity: 3, missing: false, substitution: "Other" }).problem).toMatch(
      /nothing to substitute/,
    );
    // both ticked and named: some of the rest was swapped, so it needs to know how many
    expect(decideLine(notebook, { packedQuantity: 1, missing: true, substitution: "Other" }).problem).toBe(
      "Check Notebook (Single ruled): say how many Other went in, under “How many went in instead”. The others count as not available, as “The rest isn’t available” is ticked.",
    );
  });

  it("refuses a note in the substitute box, since a substitute is charged at the ordered price", () => {
    // what packers typed in the old box to get past it
    for (const note of [
      "none",
      "None.",
      "1 short",
      "short by 1",
      "notebook short",
      "out of stock",
      "Not available",
      "N/A",
      "na",
      "nil",
      "-",
      "0",
      "x",
      "missing",
      "no substitute",
      "not in shop",
      "Item not there",
      "नाही",
    ]) {
      expect(notASubstitute(note)).toBe(true);
      expect(decideLine(notebook, { packedQuantity: 2, missing: false, substitution: note }).problem).toBe(
        `Check Notebook (Single ruled): “${note}” isn’t a substitute. Tick “The rest isn’t available” instead, or name the product you packed.`,
      );
    }
    // already ticked: the note just has to go
    expect(decideLine(notebook, { packedQuantity: 2, missing: true, substitution: "none" }).problem).toBe(
      "Check Notebook (Single ruled): “none” isn’t a substitute, and “The rest isn’t available” is already ticked. Clear the substitute box.",
    );
    // names that only look close are products
    for (const name of ["Short ruler (15 cm)", "Navneet notebook", "Nataraj pencil", "Doms"]) {
      const decision = decideLine(notebook, { packedQuantity: 2, missing: false, substitution: name });
      expect(decision.problem).toBeUndefined();
      expect(decision).toMatchObject({ substituteName: name, substituteQuantity: 1 });
    }
  });

  it("takes a line that was partly swapped and partly not there at all, with a count", () => {
    // 3 ordered: 1 on the shelf, a Navneet notebook in place of another, and none for the third
    expect(
      decideLine(notebook, {
        packedQuantity: 1,
        missing: true,
        substitution: "Navneet notebook",
        substituteQuantity: 1,
      }),
    ).toMatchObject({ packed: 1, substituteName: "Navneet notebook", substituteQuantity: 1, unavailable: 1, waiting: false });
    expect(
      decideLine(notebook, { packedQuantity: 1, missing: false, substitution: "Navneet notebook", substituteQuantity: 2 }),
    ).toMatchObject({ substituteQuantity: 2, unavailable: 0, waiting: false });
    // one swapped and nothing said about the third: still being packed
    const waiting = decideLine(notebook, {
      packedQuantity: 1,
      missing: false,
      substitution: "Navneet notebook",
      substituteQuantity: 1,
    });
    expect(waiting).toMatchObject({ waiting: true, substituteQuantity: 1, unavailable: 0 });
    expect(waitingLabel(notebook, waiting)).toBe("Notebook (Single ruled): 1 of 3 packed, 1 substituted");
    for (const [entry, problem] of [
      [{ packedQuantity: 1, missing: false, substitution: "Navneet notebook", substituteQuantity: 3 }, /3 went in instead, but only 2 of the 3 ordered weren’t packed\.$/],
      [{ packedQuantity: 1, missing: true, substitution: "Navneet notebook", substituteQuantity: 2 }, /all went in as Navneet notebook.*Untick/],
      [{ packedQuantity: 1, missing: true, substitution: "Navneet notebook", substituteQuantity: 0 }, /is 0\. Enter how many/],
      [{ packedQuantity: 1, missing: true, substituteQuantity: 1 }, /no substitute is named/],
      [{ packedQuantity: 3, missing: false, substituteQuantity: 1 }, /nothing to substitute/],
    ] as const)
      expect(decideLine(notebook, entry).problem).toMatch(problem);
    // charged for its own notebook and the substitute, not for the one that wasn't there
    expect(
      billForPacking({ lines: [notebook], decisions: [{ unavailable: 1 }], deliveryPaise: 0, discountPaise: 0 }).lines,
    ).toEqual([{ quantity: 2, linePaise: 12000 }]);
    const packed = {
      ...notebook,
      quantity: 2,
      linePaise: 12000,
      orderedQuantity: 3,
      unavailableQuantity: 1,
      substituteName: "Navneet notebook",
      substituteQuantity: 1,
    };
    expect([packedOf(packed), inBagOf(packed)]).toEqual([1, 2]);
    expect(lineNotes(packed, true)).toEqual([
      "1 of 3 not available – not charged",
      "1 of 3 substituted with Navneet notebook (same price)",
    ]);
  });

  it("finds a checklist finished before the order followed it, and lines still to finish", () => {
    const lines = [
      { ...notebook, variantId: "n" },
      { ...pen, variantId: "p" },
    ];
    // the old rules let a short line through with a note in the box, and left the order as it was
    const old = [
      { variantId: "n", packedQuantity: 2, missing: false, substitution: "Navneet notebook" },
      { variantId: "p", packedQuantity: 2, missing: false },
    ];
    expect(reviewChecklist(lines, old)).toEqual({ open: [], waiting: [], behind: ["Notebook (Single ruled)"] });
    // saved again, the order shows it
    const followed = [
      { ...lines[0], orderedQuantity: 3, substituteName: "Navneet notebook", substituteQuantity: 1 },
      { ...lines[1], orderedQuantity: 2 },
    ];
    expect(reviewChecklist(followed, old)).toEqual({ open: [], waiting: [], behind: [] });
    expect(reviewChecklist(lines, [{ variantId: "n", packedQuantity: 2, missing: false }])).toEqual({
      open: ["Notebook (Single ruled)", "Gel pen (Blue)"],
      waiting: ["Notebook (Single ruled): 2 of 3 packed"],
      behind: [],
    });
  });

  it("reads a line the checklist already changed against what was ordered", () => {
    const changed = { ...notebook, quantity: 2, linePaise: 12000, orderedQuantity: 3, unavailableQuantity: 1 };
    expect(decideLine(changed, { packedQuantity: 3, missing: false })).toMatchObject({ ordered: 3, unavailable: 0 });
    expect(packedOf(changed)).toBe(2);
    expect(inBagOf(changed)).toBe(2);
    const swapped = { ...pen, orderedQuantity: 2, substituteName: "Reynolds pen", substituteQuantity: 1 };
    expect([packedOf(swapped), inBagOf(swapped)]).toEqual([1, 2]);
  });
});

describe("The offer on a smaller bill", () => {
  it("works a percentage out again on what was packed", () => {
    const terms = { discountType: "percentage" as const, discountValue: 10 };
    expect(offerAfterPacking({ discountPaise: 2500, subtotalPaise: 25000, packedSubtotalPaise: 16000, terms })).toBe(1600);
    // rounds down, as checkout does
    expect(offerAfterPacking({ discountPaise: 2500, subtotalPaise: 25000, packedSubtotalPaise: 16005, terms })).toBe(1600);
  });

  it("keeps a percentage under its cap and never above what checkout gave", () => {
    const capped = { discountType: "percentage" as const, discountValue: 20, maximumDiscountPaise: 3000 };
    // ₹300 at 20% is ₹60, but the offer stops at ₹30: still ₹30 on ₹200 packed
    expect(offerAfterPacking({ discountPaise: 3000, subtotalPaise: 30000, packedSubtotalPaise: 20000, terms: capped })).toBe(3000);
    expect(offerAfterPacking({ discountPaise: 3000, subtotalPaise: 30000, packedSubtotalPaise: 10000, terms: capped })).toBe(2000);
    // the owner raised the percentage after the order was placed: the customer keeps what they were given
    const raised = { discountType: "percentage" as const, discountValue: 50 };
    expect(offerAfterPacking({ discountPaise: 2500, subtotalPaise: 25000, packedSubtotalPaise: 20000, terms: raised })).toBe(2500);
  });

  it("keeps a fixed saving whole, but never past the new subtotal", () => {
    const fixed = { discountType: "fixed" as const, discountValue: 5000 };
    expect(offerAfterPacking({ discountPaise: 5000, subtotalPaise: 10000, packedSubtotalPaise: 6000, terms: fixed })).toBe(5000);
    expect(offerAfterPacking({ discountPaise: 5000, subtotalPaise: 10000, packedSubtotalPaise: 4000, terms: fixed })).toBe(4000);
  });

  it("shrinks in step with the bill when the offer's terms are gone, and is nothing without one", () => {
    expect(offerAfterPacking({ discountPaise: 2500, subtotalPaise: 25000, packedSubtotalPaise: 10000 })).toBe(1000);
    expect(offerAfterPacking({ discountPaise: 0, subtotalPaise: 25000, packedSubtotalPaise: 10000 })).toBe(0);
    expect(offerAfterPacking({ discountPaise: 2500, subtotalPaise: 25000, packedSubtotalPaise: 0 })).toBe(0);
  });
});

describe("The bill for what was packed", () => {
  it("charges what went in the bag, a substitute at the ordered price, and keeps the delivery fee", () => {
    const bill = billForPacking({
      lines: [notebook, pen, glue],
      decisions: [{ unavailable: 1 }, { unavailable: 0 }, { unavailable: 1 }],
      deliveryPaise: 2000,
      discountPaise: 2500,
      terms: { discountType: "percentage", discountValue: 10 },
    });
    expect(bill).toEqual({
      lines: [
        { quantity: 2, linePaise: 12000 },
        { quantity: 2, linePaise: 4000 },
        { quantity: 0, linePaise: 0 },
      ],
      subtotalPaise: 16000,
      promotionDiscountPaise: 1600,
      totalPaise: 16400,
    });
  });

  it("starts from what was ordered, so saving again doesn't take the same item off twice", () => {
    const already = [
      { ...notebook, quantity: 2, linePaise: 12000, orderedQuantity: 3 },
      { ...pen, orderedQuantity: 2 },
      { ...glue, quantity: 0, linePaise: 0, orderedQuantity: 1 },
    ];
    const bill = billForPacking({
      lines: already,
      decisions: [{ unavailable: 1 }, { unavailable: 0 }, { unavailable: 1 }],
      deliveryPaise: 2000,
      discountPaise: 2500,
      terms: { discountType: "percentage", discountValue: 10 },
    });
    expect(bill.totalPaise).toBe(16400);
  });

  it("changes a cash bill only while the cash is still to be collected", () => {
    expect(billFollowsPacking({ paymentMethod: "cod", paymentStatus: "pending" })).toBe(true);
    expect(billFollowsPacking({ paymentMethod: "razorpay", paymentStatus: "paid" })).toBe(false);
    expect(billFollowsPacking({ paymentMethod: "razorpay", paymentStatus: "pending" })).toBe(false);
    expect(billFollowsPacking({ paymentMethod: "cod", paymentStatus: "paid" })).toBe(false);
  });
});

describe("What the customer, rider and invoice read", () => {
  it("says what wasn't there and what was swapped", () => {
    expect(lineNotes({ ...glue, quantity: 0, linePaise: 0, orderedQuantity: 1, unavailableQuantity: 1 }, true)).toEqual([
      "Not available – not charged",
    ]);
    expect(lineNotes({ ...notebook, orderedQuantity: 3, unavailableQuantity: 1 }, true)).toEqual([
      "1 of 3 not available – not charged",
    ]);
    // paid online: nothing was taken off the bill, so it doesn't claim "not charged"
    expect(lineNotes({ ...glue, orderedQuantity: 1, unavailableQuantity: 1 }, false)).toEqual(["Not available"]);
    expect(lineNotes({ ...pen, orderedQuantity: 2, substituteName: "Reynolds pen", substituteQuantity: 2 }, true)).toEqual([
      "Substituted with Reynolds pen (same price)",
    ]);
    expect(lineNotes({ ...pen, orderedQuantity: 2, substituteName: "Reynolds pen", substituteQuantity: 1 }, true)).toEqual([
      "1 of 2 substituted with Reynolds pen (same price)",
    ]);
    expect(lineNotes(notebook, true)).toEqual([]);
  });

  it("tells the customer the new total, or that a refund is arranged when they paid online", () => {
    const lines = [
      { ...notebook, quantity: 2, linePaise: 12000, orderedQuantity: 3, unavailableQuantity: 1 },
      { ...pen, orderedQuantity: 2, substituteName: "Reynolds pen", substituteQuantity: 1 },
    ];
    const cash = packingMessage({ number: "AGS-1", lines, charged: true, totalPaise: 16400, originalTotalPaise: 24500 });
    expect(cash.title).toBe("Some items weren’t available");
    expect(cash.body).toBe(
      "AGS-1: Not available – not charged: 1 × Notebook (Single ruled). Substituted at the same price: Reynolds pen for 1 × Gel pen (Blue). Your new total is ₹164 (was ₹245), to pay in cash on delivery.",
    );
    const online = packingMessage({ number: "AGS-2", lines, charged: false, totalPaise: 24500, shortfallPaise: 8100 });
    expect(online.body).toMatch(/^AGS-2: Not available: 1 × Notebook/);
    expect(online.body).toMatch(/You paid online, so the store will arrange a refund of ₹81 for what wasn’t available\.$/);
    expect(packingMessage({ number: "AGS-3", lines: [notebook], charged: true, totalPaise: 24500 })).toEqual({
      title: "Your order is packed in full",
      body: "AGS-3: everything you ordered is packed after all. Your total is back to ₹245.",
    });
  });

  it("says where the refund for items not packed stands, from the order's refunds", () => {
    expect(shortfallRefund(undefined, [])).toBeNull();
    expect(shortfallRefund(8100, [])).toBe("owed");
    expect(shortfallRefund(8100, [{ amountPaise: 8100, status: "failed" }])).toBe("owed");
    expect(shortfallRefund(8100, [{ amountPaise: 8100, status: "requested" }])).toBe("under-way");
    expect(
      shortfallRefund(8100, [
        { amountPaise: 5000, status: "processed" },
        { amountPaise: 3100, status: "processing" },
      ]),
    ).toBe("under-way");
    expect(shortfallRefund(8100, [{ amountPaise: 8100, status: "processed" }])).toBe("refunded");
  });

  it("tells the owners what is owed when it changes, and when it no longer is", () => {
    const lines = [{ ...notebook, orderedQuantity: 3, unavailableQuantity: 1 }, glue];
    expect(refundOwedNotice({ number: "AGS-2", lines, shortfallPaise: 8100 })).toEqual({
      title: "AGS-2: ₹81 to refund",
      body: "AGS-2 was paid online, and ₹81 of it is for items that weren’t packed: 1 × Notebook (Single ruled). The customer was told the store will refund it: make the refund from the Refunds page.",
    });
    // saved again with nothing new owed: no second message
    expect(refundOwedNotice({ number: "AGS-2", lines, shortfallPaise: 8100, previousPaise: 8100 })).toBeNull();
    expect(refundOwedNotice({ number: "AGS-2", lines, shortfallPaise: 5400, previousPaise: 8100 })?.body).toMatch(
      /That replaces the ₹81 from the last save\./,
    );
    expect(refundOwedNotice({ number: "AGS-2", lines: [notebook], previousPaise: 8100 })).toEqual({
      title: "AGS-2: no refund owed after all",
      body: "AGS-2 is packed in full after all, so the ₹81 for items that weren’t packed isn’t owed back to the customer.",
    });
  });

  it("fits a long school list into one message", () => {
    const lines = Array.from({ length: 30 }, (_, index) => ({
      ...glue,
      name: `School item number ${index + 1}`,
      quantity: 0,
      linePaise: 0,
      orderedQuantity: 1,
      unavailableQuantity: 1,
    }));
    const { body } = packingMessage({ number: "AGS-4", lines, charged: true, totalPaise: 2000, originalTotalPaise: 92000 });
    expect(body.length).toBeLessThanOrEqual(500);
    expect(body).toMatch(/and \d+ more\./);
    expect(body).toMatch(/Your new total is ₹20 \(was ₹920\)/);
  });
});
