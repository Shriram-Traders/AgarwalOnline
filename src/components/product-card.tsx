import type { CatalogItem } from "@/lib/catalog/queries";
import { savedProductIds } from "@/lib/engagement/saved";
import { ProductCardView } from "./product-card-view";

/** A product card on a server page: it looks up whether the signed-in shopper saved it. */
export async function ProductCard({
  product,
  locale = "en",
  saved,
  eager = false,
}: {
  product: CatalogItem;
  locale?: "en" | "mr";
  /** Leave out to look it up: the heart shows whether the signed-in shopper saved it. */
  saved?: boolean;
  eager?: boolean;
}) {
  const isSaved = saved ?? (await savedProductIds()).has(product.id);
  return <ProductCardView product={product} locale={locale} saved={isSaved} eager={eager} />;
}
