import { Product, ProductVariant } from "../db/models";
import { shopShelf } from "../catalog/queries";

/** A basket line that can't be bought any more: its product was taken off the shop (or the pack removed). */
export type UnavailableLine = {
  variantId: string;
  name: string;
  label: string;
};

/**
 * Basket lines with their pack, product and stock. They come from the shop shelf, which the page
 * loads once for every list on it (and the layout starts early), so the basket costs no extra
 * trips to the database. It used to ask three times per line, one after another, on every page,
 * which is most of what made pages slow on Atlas. Only lines that can't be bought any more need
 * a lookup, to name what was taken off the shop.
 */
export async function resolveBasketLines(raw: { id: string; variantId: unknown; quantity: number }[]) {
  const unavailable: UnavailableLine[] = [];
  if (!raw.length) return { lines: [], unavailable };
  const shelf = await shopShelf();
  const lines = [];
  const gone: string[] = [];
  for (const line of raw) {
    const v = shelf.variantById.get(String(line.variantId));
    const p = v ? shelf.byId.get(String(v.productId)) : undefined;
    if (!v || !p) {
      gone.push(String(line.variantId));
      continue;
    }
    lines.push({
      id: line.id,
      variantId: String(v._id),
      productId: String(p._id),
      categorySlug: p.categorySlug as string,
      productSlug: p.slug as string,
      name: p.name.en as string,
      image: (p.images?.[0] ?? p.image) as string | undefined,
      label: v.label as string,
      quantity: line.quantity,
      pricePaise: v.pricePaise as number,
      mrpPaise: v.mrpPaise as number,
      available: shelf.available.get(String(v._id)) ?? 0,
      maxQuantity: (v.maxQuantity ?? 10) as number,
    });
  }
  if (gone.length) {
    // taken off the shop or a pack hidden: name it so the basket can offer Remove
    const variants = await ProductVariant.find({ _id: { $in: gone } }).select("productId label");
    const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } }).select("name");
    for (const variantId of gone) {
      const v = variants.find((variant) => String(variant._id) === variantId);
      const p = v ? products.find((product) => String(product._id) === String(v.productId)) : undefined;
      unavailable.push({ variantId, name: p?.name.en ?? "An item that is no longer sold", label: v?.label ?? "" });
    }
  }
  return { lines, unavailable };
}
