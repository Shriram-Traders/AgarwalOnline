import { permanentRedirect } from "next/navigation";
import { catalog, catalogCategories, catalogSections, shelfPhotos, type CatalogItem } from "@/lib/catalog/queries";
import { categoryImages } from "@/lib/catalog/images";
import { viewKeyOf } from "@/lib/catalog/browse";
import { aisleDescription, aisleSummary, snippet } from "@/lib/seo";
import { currentLocale } from "@/lib/i18n";
import { savedProductIds } from "@/lib/engagement/saved";
import { CatalogBrowser } from "@/components/catalog-browser";
import type { CardItem } from "@/components/product-card-view";
export const dynamic = "force-dynamic";
/** Products shown per "page"; more appear as the shopper scrolls (and under Load more). */
const PAGE_SIZE = 48;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const category = (await catalogCategories()).find((item) => item.slug === params.category);
  if (params.q) return { title: `Results for “${params.q.slice(0, 60)}”`, robots: { index: false } };
  // sort and page only reorder the same list: one address per aisle for search engines
  if (category)
    return {
      title: `${category.en} online in Nagothane`,
      description: aisleDescription(category.en, await catalog({ category: category.slug })),
      alternates: { canonical: `/catalog?category=${category.slug}` },
    };
  if (params.sort === "discount") return { title: "Today’s offers and discounts", alternates: { canonical: "/catalog" } };
  const aisles = (await catalogCategories()).map((item) => item.en.toLowerCase());
  return {
    title: "All products",
    description: snippet(`All ${(await catalog()).length} products at Agarwal Online: ${aisles.slice(0, 6).join(", ")} and more.`),
    alternates: { canonical: "/catalog" },
  };
}
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const locale = await currentLocale();
  const [products, categories, sections, photos, saved] = await Promise.all([
    catalog(params),
    catalogCategories(),
    catalogSections(),
    shelfPhotos(),
    savedProductIds(),
  ]);
  const active = categories.find((category) => category.slug === params.category);
  // an aisle that was renamed or removed (a link Google or someone saved) used to show an empty page
  if (params.category && !active) permanentRedirect("/catalog");
  // ?page=3 shows the first three pages' worth: a link that works without JavaScript, and can be shared
  const page = Math.max(1, Math.min(100, Math.floor(Number(params.page)) || 1));
  const summary = aisleSummary(products);
  const shelf = ({ slug, en, mr }: { slug: string; en: string; mr: string }) => ({ slug, en, mr });
  // only what a card shows: the rest of the shop comes in one file once the page is up (/api/catalog/all)
  const card = ({ id, slug, name, brand, image, categorySlug, provider, rating, reviewCount, variants }: CatalogItem): CardItem => ({
    id,
    slug,
    name,
    brand,
    image,
    categorySlug,
    provider,
    rating,
    reviewCount,
    variants: variants.map(({ id, label, pricePaise, mrpPaise, available, maxQuantity }) => ({ id, label, pricePaise, mrpPaise, available, maxQuantity })),
  });
  return (
    <CatalogBrowser
      locale={locale}
      categories={categories.map(shelf)}
      sections={sections.map((section) => ({ ...shelf(section), shelves: section.shelves.map(shelf) }))}
      photos={Object.fromEntries(
        categories.flatMap((category) => {
          const photo = categoryImages[category.slug] ?? photos.get(category.slug);
          return photo ? [[category.slug, photo]] : [];
        }),
      )}
      saved={[...saved]}
      pageSize={PAGE_SIZE}
      initial={{
        key: viewKeyOf(params),
        items: products.slice(0, page * PAGE_SIZE).map(card),
        total: products.length,
        brands: summary.brands,
        range: summary.range,
      }}
    />
  );
}
