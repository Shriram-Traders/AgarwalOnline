import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { catalog, catalogCategories } from "@/lib/catalog/queries";

// built per request: the catalog changes without a deploy, and builds should not need the database
export const dynamic = "force-dynamic";

/** Every aisle and product, straight from the catalog, so new products are listed without a code change. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getEnv().APP_ORIGIN;
  const [products, categories] = await Promise.all([catalog({}), catalogCategories()]);
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/catalog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/serviceability`, changeFrequency: "monthly", priority: 0.4 },
    ...categories.map((category) => ({
      url: `${origin}/catalog?category=${category.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${origin}/products/${product.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
