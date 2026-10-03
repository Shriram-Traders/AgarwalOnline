import "server-only";
import { connectDB } from "../db/connect";
import { ServiceArea } from "../db/models";
import { catalog, type CatalogItem } from "../catalog/queries";
import { recommendationsFor } from "../catalog/recommendations";
import { Address, Order } from "./models";

/*
 * What fills out the basket page around the lines: where it's going, things that go with it,
 * and things this shopper bought before. All read-only, and all skip what's in the basket.
 */

type BasketLine = { productId: string; categorySlug: string };

const SHOWN = 4;
const inStock = (item: CatalogItem) => item.variants.some((variant) => variant.available > 0);

/** The delivery area of the shopper's default address (or latest one), if it's switched on. */
export async function deliveryAreaName(customerId: string) {
  await connectDB();
  const address =
    (await Address.findOne({ customerId, isDefault: true }).select("areaId")) ??
    (await Address.findOne({ customerId }).sort({ createdAt: -1 }).select("areaId"));
  if (!address) return undefined;
  const area = await ServiceArea.findOne({ _id: address.areaId, enabled: true }).select("name");
  return area?.name as string | undefined;
}

/** Items the shopper ordered in their last few orders that aren't in the basket now. */
export async function buyAgainFor(customerId: string, lines: BasketLine[]): Promise<CatalogItem[]> {
  await connectDB();
  const orders = await Order.find({ customerId }).sort({ createdAt: -1 }).limit(3).select("items.variantId");
  const bought = new Set(
    orders.flatMap((order) => order.items.map((item: { variantId: unknown }) => String(item.variantId))),
  );
  if (!bought.size) return [];
  const inBasket = new Set(lines.map((line) => line.productId));
  return (await catalog())
    .filter((item) => !inBasket.has(item.id) && inStock(item) && item.variants.some((variant) => bought.has(variant.id)))
    .slice(0, SHOWN);
}

/** "Add a little more": popular picks from the basket's main aisle, skipping what's shown elsewhere. */
export async function basketSuggestions(
  customerId: string | undefined,
  lines: BasketLine[],
  skip: CatalogItem[] = [],
): Promise<CatalogItem[]> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.categorySlug, (counts.get(line.categorySlug) ?? 0) + 1);
  const category = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const hidden = new Set([...lines.map((line) => line.productId), ...skip.map((item) => item.id)]);
  return (await recommendationsFor({ customerId, category, limit: 16 }))
    .filter((item) => !hidden.has(item.id))
    .slice(0, SHOWN);
}
