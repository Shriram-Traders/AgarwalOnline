import { shopCatalogue } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";

/**
 * The whole shop for a shopper's phone, loaded once per visit (catalog-browser.tsx): every product on
 * sale with what a card, a search and a sort read, the shelves' names and the owner's synonyms.
 * About 400 products come to roughly 20 KB compressed. The CDN keeps a copy for 30 seconds, so a busy
 * minute asks the database once; stock is that fresh, and checkout counts it again before an order.
 */
export async function GET() {
  const { items, aisles, synonyms } = await shopCatalogue();
  return Response.json(
    {
      at: Date.now(),
      aisles,
      synonyms,
      items: items.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        brand: item.brand,
        image: item.image,
        categorySlug: item.categorySlug,
        alsoOn: item.alsoOn,
        aliases: item.aliases,
        bestseller: item.bestseller,
        createdAt: item.createdAt,
        rating: item.rating,
        reviewCount: item.reviewCount,
        ...(item.provider ? { provider: item.provider } : {}),
        variants: item.variants.map(({ id, label, pricePaise, mrpPaise, available, maxQuantity }) => ({
          id,
          label,
          pricePaise,
          mrpPaise,
          available,
          maxQuantity,
        })),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" } },
  );
}
