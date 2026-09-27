import { expect, it } from "vitest";
import { z } from "zod";
import { plainMessage } from "../src/lib/form-errors";

const schema = z.object({
  pricePaise: z.coerce.number().int().positive().max(10000000),
  sku: z.string().regex(/^[A-Z-]+$/),
  nameEn: z.string().min(3),
  pincodes: z.string().regex(/^\d{6}$/, "Enter comma-separated six-digit PIN codes."),
  kind: z.enum(["code", "automatic"]),
  email: z.email(),
});
const message = (input: object) => {
  const result = schema.safeParse({ pricePaise: 100, sku: "A", nameEn: "Pen", pincodes: "402106", kind: "code", email: "a@b.in", ...input });
  if (result.success) throw new Error("expected a validation error");
  return plainMessage(result.error);
};

it("names the field and shows paise limits in rupees", () => {
  expect(message({ pricePaise: 0 })).toBe("Price must be more than ₹0.");
  expect(message({ pricePaise: 20000000 })).toBe("Price must be at most ₹1,00,000.");
  expect(message({ pricePaise: "abc" })).toBe("Price must be a number.");
});

it("rewrites format, length, choice and missing-value errors", () => {
  expect(message({ sku: "a b" })).toBe("SKU is not in the right format.");
  expect(message({ nameEn: "P" })).toBe("English name needs at least 3 characters.");
  expect(message({ kind: "other" })).toBe("Choose kind from the list.");
  expect(message({ email: "nope" })).toBe("Enter a valid email address.");
  expect(message({ nameEn: undefined })).toBe("English name is required.");
});

it("keeps messages a schema spells out itself", () => {
  expect(message({ pincodes: "12" })).toBe("Enter comma-separated six-digit PIN codes.");
});
