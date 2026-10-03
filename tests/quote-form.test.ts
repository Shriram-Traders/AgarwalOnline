import { describe, expect, it } from "vitest";
import { formWithPaise } from "../src/lib/display";
import { sheetFromForm } from "../src/lib/schools/quote-form";
import { returnPath } from "../src/lib/return-path";
import { schoolJoinHref, schoolJoinPath } from "../src/lib/schools/links";
import { ownerStatus, repStatus, schoolHref } from "../src/lib/schools/display";

const A = "a".repeat(24);
const B = "b".repeat(24);

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return formWithPaise(data);
};

describe("The owner's pricing sheet as typed", () => {
  it("reads each line's boxes by its pack id, with rupees turned into paise", () => {
    const sheet = sheetFromForm(
      form({
        operation: "save-draft",
        snapshot: "{}",
        [`qty_${A}`]: "500",
        [`price_${A}Rupees`]: "42.50",
        [`gst_${A}`]: "18",
        [`hsn_${A}`]: " 4820 ",
        [`qty_${B}`]: "0",
        [`price_${B}Rupees`]: "",
        [`gst_${B}`]: "",
        [`hsn_${B}`]: "",
        discountType: "percent",
        discountPercent: "5",
        validUntil: "2026-10-17",
        note: "  Two lots  ",
      }),
    );
    expect(sheet.lines).toEqual([
      { variantId: A, quantity: 500, unitPricePaise: 4250, gstRatePercent: 18, hsnCode: "4820" },
      { variantId: B, quantity: 0, unitPricePaise: undefined, gstRatePercent: Number.NaN, hsnCode: undefined },
    ]);
    expect(sheet.discount).toEqual({ type: "percent", percent: 5 });
    expect(sheet).toMatchObject({ validUntil: "2026-10-17", note: "Two lots" });
  });

  it("takes an amount discount in rupees, and treats anything else as no discount", () => {
    expect(sheetFromForm(form({ discountType: "amount", discountRupees: "100" })).discount).toEqual({ type: "amount", paise: 10000 });
    expect(sheetFromForm(form({ discountType: "bogus" })).discount).toEqual({ type: "none" });
    expect(sheetFromForm(form({ discountType: "amount", discountRupees: "abc" })).discount).toMatchObject({ type: "amount" });
  });

  it("ignores boxes that aren't a pack id", () => {
    expect(sheetFromForm(form({ qty_nope: "5", [`qty_${A}x`]: "1" })).lines).toEqual([]);
  });
});

describe("School links and pages", () => {
  const token = "Abc_def-1234567890123456";
  it("comes back to a join page or the school area after signing in, and nowhere else", () => {
    expect(schoolJoinHref(token)).toBe(`/school/join/${token}`);
    expect(returnPath(`/school/join/${token}`)).toBe(`/school/join/${token}`);
    expect(returnPath("/school")).toBe("/school");
    expect(schoolJoinPath("/school/join/short")).toBeNull();
    expect(returnPath(`/school/join/${token}/../../admin`)).toBeNull();
    expect(returnPath("https://example.com/school")).toBeNull();
  });

  it("keeps the chosen school in links", () => {
    expect(schoolHref("/school/quote", A)).toBe(`/school/quote?s=${A}`);
    expect(schoolHref("/school", A, { q: "pens", category: undefined })).toBe(`/school?s=${A}&q=pens`);
  });

  it("names each state plainly, and an expired quotation as expired", () => {
    expect(repStatus("requested").label).toBe("Waiting for prices");
    expect(repStatus("quoted", "2999-01-01").label).toBe("Quotation ready");
    expect(repStatus("quoted", "2000-01-01")).toEqual({ label: "Expired", tone: "bad" });
    expect(ownerStatus("changes-requested").tone).toBe("warn");
    expect(ownerStatus("accepted").label).toBe("Accepted");
  });
});
