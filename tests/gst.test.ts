import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  GST_RATES,
  gstinCheckChar,
  gstRateField,
  hsnField,
  stateName,
  stateOfGstin,
  taxProfileSchema,
  validGstin,
} from "../src/lib/tax/gst";
import { plainMessage } from "../src/lib/form-errors";

const message = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? null : plainMessage(result.error);
};

describe("GST details", () => {
  it("checks a GSTIN's format, state and check letter", () => {
    // published examples whose check letters this formula reproduces
    expect(validGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(validGstin("29AAGCB7383J1Z4")).toBe(true);
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
    expect(validGstin("27AAPFU0939F1ZW")).toBe(false); // wrong check letter
    expect(validGstin("27AAPFU0939F1V")).toBe(false); // too short
    expect(validGstin("99AAPFU0939F1ZV")).toBe(false); // no such state
    expect(stateOfGstin("27AAPFU0939F1ZV")).toBe("27");
    expect(stateName("27")).toBe("Maharashtra");
  });

  it("uses the current GST slabs", () => {
    expect([...GST_RATES]).toEqual([0, 5, 18, 40]);
    expect(message(gstRateField, "12")).toBe("Choose a GST rate from the list.");
    expect(gstRateField.parse("18")).toBe(18);
    expect(message(hsnField, "482")).toBe("HSN code is 4, 6 or 8 digits.");
    expect(hsnField.parse("48202000")).toBe("48202000");
  });

  it("keeps the shop's GSTIN and state in step, and treats blanks as not given", () => {
    const base = { legalName: "Agarwal General Stores", address: "Main Road, Nagothane", stateCode: "27" };
    expect(taxProfileSchema.parse({ ...base, gstin: "", phone: "", email: "", terms: "" })).toEqual(base);
    expect(taxProfileSchema.parse({ ...base, gstin: "27aapfu0939f1zv" }).gstin).toBe("27AAPFU0939F1ZV");
    expect(message(taxProfileSchema, { ...base, stateCode: "24", gstin: "27AAPFU0939F1ZV" })).toBe(
      "The GSTIN starts with 27 (Maharashtra) but the state is Gujarat.",
    );
    expect(message(taxProfileSchema, { ...base, gstin: "27AAPFU0939F1ZW" })).toMatch(/^Check the GSTIN/);
  });
});
