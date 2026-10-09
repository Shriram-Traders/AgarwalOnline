import Link from "next/link";
import { SearchX } from "lucide-react";
import { catalog, catalogCategories } from "@/lib/catalog/queries";
import { ProductCard } from "@/components/product-card";
import { currentLocale } from "@/lib/i18n";
import { CatalogFilterPanel } from "@/components/catalog-filter-panel";
export const dynamic = "force-dynamic";
/** Products shown per "page"; Load more shows the next lot under them. */
const PAGE_SIZE = 48;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const category = (await catalogCategories()).find((item) => item.slug === params.category);
  if (params.q) return { title: `Results for “${params.q.slice(0, 60)}”`, robots: { index: false } };
  if (category)
    return {
      title: `${category.en} online in Nagothane`,
      description: `Shop ${category.en.toLowerCase()} from Agarwal General Stores with same-day delivery in and around Nagothane.`,
    };
  if (params.sort === "discount") return { title: "Today’s offers and discounts" };
  return { title: "All products" };
}
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const savedLocale = await currentLocale();
  const locale = params.lang
    ? params.lang === "mr"
      ? "mr"
      : "en"
    : savedLocale;
  const [products, categories] = await Promise.all([
    catalog(params),
    catalogCategories(),
  ]);
  const active = categories.find((category) => category.slug === params.category);
  // ?page=3 shows the first three pages' worth: a link that works without JavaScript, and can be shared
  const page = Math.max(1, Math.min(100, Math.floor(Number(params.page)) || 1));
  const shown = products.slice(0, page * PAGE_SIZE);
  const more = products.length - shown.length;
  const nextHref = `/catalog?${new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page")),
    page: String(page + 1),
  })}`;
  return (
    <section className="page-container">
      <div className="section-heading">
        <div>
          <h1>{active ? active[locale] : locale === "mr" ? "सर्व उत्पादने" : "All products"}</h1>
        </div>
      </div>
      <nav className="catalog-chips" aria-label="Browse product categories">
        <Link
          href={`/catalog?${new URLSearchParams({ lang: locale })}`}
          aria-current={!params.category ? "page" : undefined}
        >
          {locale === "mr" ? "सर्व" : "All"}
        </Link>
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/catalog?${new URLSearchParams({ lang: locale, category: category.slug })}`}
            aria-current={
              params.category === category.slug ? "page" : undefined
            }
          >
            {category[locale]}
          </Link>
        ))}
      </nav>
      <CatalogFilterPanel locale={locale} params={params} />
      <div className="results-line">
        <p>
          {more > 0 && (locale === "mr" ? `${shown.length} दाखवत आहोत, एकूण ` : `Showing ${shown.length} of `)}
          <strong>{products.length}</strong>{" "}
          {locale === "mr" ? "उत्पादने" : products.length === 1 ? "product" : "products"}
          {params.q ? (locale === "mr" ? ` “${params.q}” साठी` : ` for “${params.q}”`) : ""}
        </p>
        {(params.q || params.category || params.inStock || params.sort) && (
          <Link href={`/catalog?lang=${locale}`}>{locale === "mr" ? "फिल्टर काढा" : "Clear filters"}</Link>
        )}
      </div>
      {products.length ? (
        <>
          <div className="product-grid">
            {shown.map((p, index) => (
              <ProductCard
                key={p.id}
                product={p}
                locale={locale}
                eager={index === 0}
              />
            ))}
          </div>
          {more > 0 && (
            <div className="load-more">
              {/* stays where it is: the next products appear under the ones already seen */}
              <Link href={nextHref} scroll={false} className="secondary-button">
                {locale === "mr"
                  ? `आणखी ${Math.min(more, PAGE_SIZE)} दाखवा`
                  : `Load ${Math.min(more, PAGE_SIZE)} more${more > PAGE_SIZE ? ` of ${more}` : ""}`}
              </Link>
            </div>
          )}
        </>
      ) : (
        <div className="panel empty-state">
          <SearchX size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <h2>
            {locale === "mr" ? "उत्पादने सापडली नाहीत" : "No products found"}
          </h2>
          <p>{locale === "mr" ? "इंग्रजी किंवा मराठीत दुसरे नाव वापरून पाहा, किंवा फिल्टर काढा." : "Try another name in English or Marathi, or clear your filters."}</p>
          <Link href={`/catalog?lang=${locale}`} className="primary-button">{locale === "mr" ? "सर्व उत्पादने पाहा" : "Show all products"}</Link>
        </div>
      )}
    </section>
  );
}
