import { z } from "zod";

/*
 * GST facts the school quotations need. Plain data and zod only, so pages, forms in the
 * browser and the server all read the same rules.
 */

/**
 * The GST slabs since 22 September 2025: most goods at 0, 5 or 18%, 40% for luxury goods.
 * The old 12% and 28% slabs were folded into these. Change this one list if the CA says so.
 */
export const GST_RATES = [0, 5, 18, 40] as const;
export type GstRate = (typeof GST_RATES)[number];
export const isGstRate = (value: number): value is GstRate =>
  (GST_RATES as readonly number[]).includes(value);

/** State codes as GST uses them: the first two digits of a GSTIN. */
export const GST_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;
export const SHOP_STATE = "27";
export const stateName = (code?: string | null) =>
  GST_STATES.find((state) => state.code === code)?.name;

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The 15th character of a GSTIN: a base-36 checksum over the first 14. */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = CHARS.indexOf(first14.charAt(i)) * ((i % 2) + 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS.charAt((36 - (sum % 36)) % 36);
}

/** A well-formed GSTIN from a real state, with a checksum that adds up. */
export function validGstin(value: string) {
  return (
    GSTIN_RE.test(value) &&
    Boolean(stateName(value.slice(0, 2))) &&
    gstinCheckChar(value.slice(0, 14)) === value.charAt(14)
  );
}
export const stateOfGstin = (value?: string | null) =>
  value && GSTIN_RE.test(value) ? value.slice(0, 2) : undefined;

/** HSN codes on quotations: 4, 6 or 8 digits. */
export const HSN_RE = /^\d{4}(\d{2}){0,2}$/;

/** A blank form box, or a value stored as empty, counts as "not given". */
const blank = (value: unknown) =>
  value === null || (typeof value === "string" && !value.trim()) ? undefined : value;
export const optionalField = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

export const gstRateField = z.coerce
  .number()
  .refine(isGstRate, "Choose a GST rate from the list.");
export const hsnField = z.string().trim().regex(HSN_RE, "HSN code is 4, 6 or 8 digits.");
export const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .refine(validGstin, "Check the GSTIN: it is 15 characters, like 27ABCDE1234F1Z5, and the last one is a check letter.");
export const stateField = z
  .string()
  .refine((code) => Boolean(stateName(code)), "Choose a state from the list.");

/** The GSTIN's first two digits are its state, so the two must agree. */
export function gstinStateProblem(gstin?: string, stateCode?: string) {
  const fromGstin = stateOfGstin(gstin);
  if (!fromGstin || !stateCode || fromGstin === stateCode) return undefined;
  return `The GSTIN starts with ${fromGstin} (${stateName(fromGstin)}) but the state is ${stateName(stateCode) ?? stateCode}.`;
}

/** The shop's own details, printed at the top of every quotation and on the Contact & Grievance page. */
export const taxProfileSchema = z
  .object({
    legalName: z.string().trim().min(2).max(120),
    gstin: optionalField(gstinField),
    address: z.string().trim().min(5).max(300),
    stateCode: stateField,
    phone: optionalField(z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit phone number.")),
    email: optionalField(z.email("Enter a valid email address.")),
    terms: optionalField(z.string().trim().max(1000)),
    // the e-commerce rules want a named grievance officer on the site; shown on /contact only
    grievanceName: optionalField(z.string().trim().min(2).max(80)),
    grievanceDesignation: optionalField(z.string().trim().min(2).max(80)),
  })
  .superRefine((value, ctx) => {
    const problem = gstinStateProblem(value.gstin, value.stateCode);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["gstin"] });
  });
export type TaxProfile = z.infer<typeof taxProfileSchema>;
export const DEFAULT_TAX_PROFILE: TaxProfile = {
  legalName: "Agarwal General Stores",
  address: "Nagothane, Raigad",
  stateCode: SHOP_STATE,
};
