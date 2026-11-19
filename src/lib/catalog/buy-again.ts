import { Order } from "@/lib/commerce/models";

/**
 * What a shopper buys again: the products in their last 20 orders that weren't cancelled. The ones in
 * the most orders come first, then the most recent; anything in stock before anything sold out.
 * `products` is the shop's own list (catalog()), so hidden or deleted products never come back here.
 */
export async function buyAgain<T extends { variants: { id: string; available: number }[] }>(customerId: string, products: T[]) {
  const orders = await Order.find({ customerId, orderStatus: { $ne: "cancelled" } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("items.variantId")
    .lean<{ items?: { variantId: unknown }[] }[]>();
  // a pack's score: 100 for each order it was in, less how many orders ago it was last bought
  const score = new Map<string, number>();
  orders.forEach((order, ago) => {
    // an old or partial order may have no items
    for (const id of new Set((order.items ?? []).map((item) => String(item.variantId))))
      score.set(id, score.has(id) ? score.get(id)! + 100 : 100 - ago);
  });
  const best = (product: T) => Math.max(0, ...product.variants.map((variant) => score.get(variant.id) ?? 0));
  const inStock = (product: T) => product.variants.some((variant) => variant.available > 0);
  return products
    .filter((product) => best(product) > 0)
    .sort((a, b) => Number(inStock(b)) - Number(inStock(a)) || best(b) - best(a));
}
