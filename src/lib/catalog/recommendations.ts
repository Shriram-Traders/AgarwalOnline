import "server-only";

import { Order } from "../commerce/models";
import { catalog, type CatalogItem } from "./queries";

export async function recommendationsFor(options: {
  customerId?: string;
  category?: string;
  excludeSlug?: string;
  limit?: number;
} = {}): Promise<CatalogItem[]> {
  // the catalogue and this shopper's past orders don't depend on each other
  const [all, orders] = await Promise.all([
    catalog(),
    options.customerId
      ? Order.find({ customerId: options.customerId }).sort({ createdAt: -1 }).limit(20).select("items.variantId")
      : [],
  ]);
  const scores = new Map<string, number>();
  const add = (slug: string, score: number) =>
    scores.set(slug, (scores.get(slug) ?? 0) + score);
  for (const product of all) {
    if (product.bestseller) add(product.slug, 8);
    if (product.featured) add(product.slug, 5);
    if (product.categorySlug === options.category) add(product.slug, 7);
    if (product.variants.some((variant) => variant.available > 0)) add(product.slug, 2);
  }
  if (options.customerId) {
    const purchased = new Set(
      orders.flatMap((order) =>
        order.items.map((item: { variantId: unknown }) => String(item.variantId)),
      ),
    );
    for (const product of all)
      if (product.variants.some((variant) => purchased.has(variant.id)))
        add(product.slug, 12);
  }
  return all
    .filter(
      (product) =>
        product.slug !== options.excludeSlug &&
        product.variants.some((variant) => variant.available > 0),
    )
    .sort(
      (a, b) =>
        (scores.get(b.slug) ?? 0) - (scores.get(a.slug) ?? 0) ||
        a.name.en.localeCompare(b.name.en),
    )
    .slice(0, options.limit ?? 6);
}
