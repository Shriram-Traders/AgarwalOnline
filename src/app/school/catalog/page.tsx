import Link from "next/link";
import { cookies } from "next/headers";
import { SearchX } from "lucide-react";
import { requireSchoolPage } from "@/lib/schools/access";
import { schoolAisles, schoolCatalog } from "@/lib/schools/catalog";
import { quoteBasketView } from "@/lib/schools/quotes";
import { SchoolProductCard, SchoolProductRow } from "@/components/school-product-card";
import { SchoolViewSwitch } from "@/components/school-view-switch";
import { VIEW_COOKIE } from "@/lib/schools/view";
import { withQuery } from "@/lib/schools/paths";
export const metadata = { title: "School catalogue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = { s?: string; q?: string; category?: string; view?: string };

/** The school catalogue, laid out like the shop's: aisles, a count, and cards or a bulk list. */
export default async function SchoolCatalog({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) || undefined;
  const category = params.category?.slice(0, 60) || undefined;
  const { school } = await requireSchoolPage(params.s, withQuery("/school/catalog", { q, category }));
  const remembered = (await cookies()).get(VIEW_COOKIE)?.value;
  const view = params.view === "list" || params.view === "cards" ? params.view : remembered === "list" ? "list" : "cards";
  const [products, aisles, basket] = await Promise.all([
    schoolCatalog({ q, category }),
    schoolAisles(),
    quoteBasketView(school.id),
  ]);
  const inBasket = Object.fromEntries(basket.lines.map((line) => [line.variantId, line.quantity]));
  const active = aisles.find((aisle) => aisle.slug === category);
  const href = (extra: Record<string, string | undefined>) => withQuery("/school/catalog", { q, category, ...extra });
  return (
    <section className="page-container school-catalog">
      <div className="section-heading">
        <div>
          <span className="eyebrow">School prices, before GST</span>
          <h1>{active ? active.en : "All school items"}</h1>
        </div>
      </div>
      {aisles.length > 1 && (
        <nav className="catalog-chips" aria-label="School aisles">
          <Link href={href({ category: undefined })} aria-current={!category ? "page" : undefined}>
            All
          </Link>
          {aisles.map((aisle) => (
            <Link key={aisle.slug} href={href({ category: aisle.slug })} aria-current={category === aisle.slug ? "page" : undefined}>
              {aisle.en}
            </Link>
          ))}
        </nav>
      )}
      <div className="results-line">
        <p>
          <strong>{products.length}</strong> {products.length === 1 ? "item" : "items"}
          {q ? ` for “${q}”` : ""}
          {(q || category) && (
            <>
              {" · "}
              <Link href="/school/catalog">Clear</Link>
            </>
          )}
        </p>
        <SchoolViewSwitch view={view} back={href({})} />
      </div>
      {!products.length ? (
        <div className="panel empty-state">
          <SearchX size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <h2>{q || category ? "Nothing matches" : "The school catalogue is being set up"}</h2>
          <p>
            {q || category
              ? "Try another word, or clear the search. Ask the store if you need something that isn’t listed."
              : "The store hasn’t listed school items yet. You’ll see them here once it does."}
          </p>
          {(q || category) && (
            <Link href="/school/catalog" className="primary-button">
              Show everything
            </Link>
          )}
        </div>
      ) : view === "list" ? (
        <ul className="school-list" aria-label="School items">
          {products.map((product) => (
            <SchoolProductRow key={product.id} product={product} schoolId={school.id} inBasket={inBasket} />
          ))}
        </ul>
      ) : (
        <div className="product-grid school-grid">
          {products.map((product, index) => (
            <SchoolProductCard key={product.id} product={product} schoolId={school.id} inBasket={inBasket} eager={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}
