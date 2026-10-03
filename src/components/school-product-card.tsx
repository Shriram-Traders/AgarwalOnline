import Image from "next/image";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { expectedPrice, quoteMoney } from "@/lib/schools/display";
import { AisleIcon } from "./aisle-icon";
import { QuoteAdd } from "./quote-add";

/**
 * A product in the school catalogue: the expected school price before GST (or "Price on
 * quotation"), and a quantity box. Stock and the shop's own price don't apply to a quotation.
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
  const first = p.variants[0];
  const prices = p.variants.map((v) => v.schoolPricePaise).filter((n): n is number => n != null);
  const shown =
    p.variants.length > 1 && prices.length
      ? `From ${quoteMoney(Math.min(...prices))} + GST${p.gstRatePercent != null ? ` (${p.gstRatePercent}%)` : ""}`
      : expectedPrice(first.schoolPricePaise, p.gstRatePercent, quoteMoney);
  const already = p.variants.reduce((n, v) => n + (inBasket[v.id] ?? 0), 0);
  return (
    <article className="product-card school-card">
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
      {p.variants.length === 1 && <span className="pack">{first.label}</span>}
      <p className={first.schoolPricePaise == null && !prices.length ? "school-price muted" : "school-price"}>{shown}</p>
      <QuoteAdd
        schoolId={schoolId}
        name={p.name.en}
        packs={p.variants.map((v) => ({
          id: v.id,
          label: v.label,
          price: v.schoolPricePaise != null ? `${quoteMoney(v.schoolPricePaise)} + GST` : "price on quotation",
        }))}
      />
    </article>
  );
}
