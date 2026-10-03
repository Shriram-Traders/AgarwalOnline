import "server-only";
import { connectDB } from "../db/connect";
import { Product } from "../db/models";
import { catalogCategories, catalogForSchools } from "../catalog/queries";
import { schoolVisible } from "../catalog/visibility";

/** What a school representative can ask a quotation for, with expected school prices. */
export function schoolCatalog(input: { q?: string; category?: string } = {}) {
  return catalogForSchools(input);
}

/** The aisles that hold at least one school item, for the catalogue's aisle chips. */
export async function schoolAisles() {
  await connectDB();
  const [slugs, aisles] = await Promise.all([
    Product.distinct("categorySlug", schoolVisible),
    catalogCategories(),
  ]);
  return aisles.filter((aisle) => slugs.includes(aisle.slug));
}
