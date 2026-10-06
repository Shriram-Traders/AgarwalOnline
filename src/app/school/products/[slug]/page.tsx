import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, Users } from "lucide-react";
import { productImages } from "@/lib/catalog/images";
import { schoolProductBySlug } from "@/lib/catalog/queries";
import { requireSchoolPage } from "@/lib/schools/access";
import { schoolAisles } from "@/lib/schools/catalog";
import { quoteBasketView } from "@/lib/schools/quotes";
import { quoteMoney } from "@/lib/schools/display";
import { ProductGallery } from "@/components/product-gallery";
import { QuoteAdd } from "@/components/quote-add";
export const dynamic = "force-dynamic";

// a fixed title: school-only products' names mustn't reach anyone who isn't a representative
export const metadata = { title: "School item", robots: { index: false, follow: false } };

/**
 * A product in the school marketplace, laid out like the shop's product page: photos, each
 * pack with its school price before GST, and a quantity box that adds to the shared basket.
 * Only for representatives, and only products ticked for schools.
 */
export default async function SchoolProduct({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const [{ slug }, { s }] = await Promise.all([params, searchParams]);
  const { school } = await requireSchoolPage(s, `/school/products/${encodeURIComponent(slug)}`);
  const p = await schoolProductBySlug(slug);
  if (!p) notFound();
  const [aisles, basket] = await Promise.all([schoolAisles(), quoteBasketView(school.id)]);
  const aisle = aisles.find((entry) => entry.slug === p.categorySlug);
  const image = p.image ?? productImages[p.slug];
  const inBasket = new Map(basket.lines.map((line) => [line.variantId, line.quantity]));
  const specs = p.specifications.filter((spec) => spec.label.en !== "Seller");
  const inThisBasket = p.variants.reduce((n, v) => n + (inBasket.get(v.id) ?? 0), 0);
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/school/catalog">All school items</Link>
        <ChevronRight size={14} aria-hidden="true" />
        {aisle && (
          <>
            <Link href={`/school/catalog?category=${aisle.slug}`}>{aisle.en}</Link>
            <ChevronRight size={14} aria-hidden="true" />
          </>
        )}
        <span aria-current="page">{p.name.en}</span>
      </nav>
      <div className="product-detail">
        <ProductGallery
          images={[...p.images, ...(image && !p.images.includes(image) ? [image] : [])]}
          name={p.name.en}
          category={p.categorySlug}
        />
        <div className="product-info">
          <div className="product-title-row">
            <span className="eyebrow">{aisle?.en ?? "School item"}</span>
          </div>
          <h1>{p.name.en}</h1>
          <p className="muted" lang="mr">
            {p.name.mr}
          </p>
          <div className="product-assurance-row">
            <span>
              <FileText size={14} aria-hidden="true" /> Priced on your quotation
            </span>
            <span>
              <Users size={14} aria-hidden="true" />{" "}
              {inThisBasket
                ? `${inThisBasket.toLocaleString("en-IN")} already in the basket`
                : `Shared basket for ${school.name}`}
            </span>
          </div>
          {p.description.en && <p className="description">{p.description.en}</p>}
          {p.variants.length > 1 && <h2 className="variant-heading">Choose your pack</h2>}
          <div className="variant-list">
            {p.variants.map((v) => {
              const already = inBasket.get(v.id) ?? 0;
              return (
                <div className="panel variant-card" key={v.id}>
                  <div className="variant-info">
                    <strong>{v.label}</strong>
                    <span className="variant-price">
                      {v.schoolPricePaise != null ? (
                        <>
                          <b>{quoteMoney(v.schoolPricePaise)}</b>
                          <small> + GST{p.gstRatePercent != null ? ` (${p.gstRatePercent}%)` : ""}</small>
                        </>
                      ) : (
                        <b className="muted">Price on quotation</b>
                      )}
                    </span>
                    <small className="muted">
                      {already ? `${already.toLocaleString("en-IN")} in your school’s basket` : "School price, before GST"}
                    </small>
                  </div>
                  <QuoteAdd
                    schoolId={school.id}
                    name={`${p.name.en}, ${v.label}`}
                    packs={[{ id: v.id, label: v.label, price: "" }]}
                  />
                </div>
              );
            })}
          </div>
          <p className="notice product-delivery-note">
            The store confirms prices and delivery on the quotation. Nothing is paid here.
          </p>
          {specs.length > 0 && (
            <dl className="product-specs">
              {specs.map((spec) => (
                <div key={spec.label.en}>
                  <dt>{spec.label.en}</dt>
                  <dd>{spec.value.en}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
