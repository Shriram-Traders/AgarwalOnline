import Image from "next/image";
import Link from "next/link";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { quoteMoney } from "@/lib/schools/display";
import { AisleIcon } from "./aisle-icon";
import { QuoteAdd } from "./quote-add";

/** "₹42.50 + GST", "From ₹31.00 + GST" for several packs, or "Price on quotation". */
export function schoolPriceText(p: CatalogItem) {
  const prices = p.variants.map((v) => v.schoolPricePaise).filter((n): n is number => n != null);
  if (!prices.length) return null;
  const lowest = Math.min(...prices);
  return `${p.variants.length > 1 ? "From " : ""}${quoteMoney(lowest)}`;
}

const packsFor = (p: CatalogItem) =>
  p.variants.map((v) => ({
    id: v.id,
    label: v.label,
    price: v.schoolPricePaise != null ? `${quoteMoney(v.schoolPricePaise)} + GST` : "price on quotation",
  }));

/**
 * A product in the school marketplace, laid out like the shop's product card: photo and name
 * open its page; the school price before GST (or "Price on quotation"), and a quantity box
 * that adds to the school's shared basket. Stock doesn't apply to a quotation.
 */
export function SchoolProductCard({
  product: p,
  schoolId,
  inBasket,
  eager = false,
}: {
  product: CatalogItem;
  schoolId: string;
  /** Pack id → quantity already in the school's basket. */
  inBasket: Record<string, number>;
  eager?: boolean;
}) {
  const image = p.image ?? productImages[p.slug];
  const price = schoolPriceText(p);
  const already = p.variants.reduce((n, v) => n + (inBasket[v.id] ?? 0), 0);
  return (
    <article className="product-card school-card">
      <Link href={`/school/products/${p.slug}`} className="product-link">
        <div className={`product-art${image ? "" : " quiet"}`}>
          {image ? (
            <Image
              src={image}
              alt={`Representative ${p.name.en.toLowerCase()} photography`}
              fill
              sizes="(max-width: 760px) 45vw, 220px"
              loading={eager ? "eager" : "lazy"}
              className="product-photo"
            />
          ) : (
            <AisleIcon slug={p.categorySlug} />
          )}
          {already > 0 && <span className="stock-badge in-quote">{already.toLocaleString("en-IN")} in basket</span>}
        </div>
        <h3>{p.name.en}</h3>
        <span className="pack">{p.variants.length > 1 ? `${p.variants.length} pack sizes` : p.variants[0].label}</span>
      </Link>
      <p className={price ? "school-price" : "school-price muted"}>
        {price ? (
          <>
            <strong>{price}</strong> <small>+ GST{p.gstRatePercent != null ? ` (${p.gstRatePercent}%)` : ""}</small>
          </>
        ) : (
          "Price on quotation"
        )}
      </p>
      <QuoteAdd schoolId={schoolId} name={p.name.en} packs={packsFor(p)} />
    </article>
  );
}

/** The same product as one row of the bulk list: for schools filling long lists by quantity. */
export function SchoolProductRow({
  product: p,
  schoolId,
  inBasket,
}: {
  product: CatalogItem;
  schoolId: string;
  inBasket: Record<string, number>;
}) {
  const image = p.image ?? productImages[p.slug];
  const price = schoolPriceText(p);
  const already = p.variants.reduce((n, v) => n + (inBasket[v.id] ?? 0), 0);
  return (
    <li className="school-row">
      <Link href={`/school/products/${p.slug}`} className="school-row-item">
        <span className={`school-row-art${image ? "" : " quiet"}`}>
          {image ? (
            <Image src={image} alt="" width={56} height={56} className="product-photo" />
          ) : (
            <AisleIcon slug={p.categorySlug} />
          )}
        </span>
        <span>
          <strong>{p.name.en}</strong>
          <small>
            {p.variants.length > 1 ? `${p.variants.length} pack sizes` : p.variants[0].label}
            {already > 0 && ` · ${already.toLocaleString("en-IN")} in basket`}
          </small>
        </span>
      </Link>
      <span className={price ? "school-row-price" : "school-row-price muted"}>
        {price ? (
          <>
            <strong>{price}</strong>
            <small>+ GST{p.gstRatePercent != null ? ` (${p.gstRatePercent}%)` : ""}</small>
          </>
        ) : (
          "On quotation"
        )}
      </span>
      <QuoteAdd schoolId={schoolId} name={p.name.en} packs={packsFor(p)} compact />
    </li>
  );
}
