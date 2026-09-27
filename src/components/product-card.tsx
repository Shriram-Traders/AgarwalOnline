import Image from "next/image";
import Link from "next/link";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { discountPercent, formatPrice } from "@/lib/display";
import { QuickAdd } from "./quick-add";
import { WishlistButton } from "./wishlist-button";
import { AisleIcon } from "./aisle-icon";

export function ProductCard({
  product: p,
  locale = "en",
  saved = false,
  eager = false,
}: {
  product: CatalogItem;
  locale?: "en" | "mr";
  saved?: boolean;
  eager?: boolean;
}) {
  const v = p.variants[0];
  const image = p.image ?? productImages[p.slug];
  const off = discountPercent(v.pricePaise, v.mrpPaise);
  return (
    <article className="product-card">
      <WishlistButton productId={p.id} name={p.name[locale]} saved={saved} />
      <Link href={`/products/${p.slug}?lang=${locale}`} className="product-link">
        <div className={`product-art${image ? "" : " quiet"}`}>
          {image ? (
            <Image
              src={image}
              alt={`Representative ${p.name.en.toLowerCase()} photography`}
              fill
              sizes="(max-width: 760px) 45vw, 220px"
              loading={eager ? "eager" : "lazy"}
              unoptimized
              className="product-photo"
            />
          ) : (
            <AisleIcon slug={p.categorySlug} />
          )}
          {off > 0 && <span className="discount">−{off}%</span>}
          {!v.available && <span className="stock-badge">Sold out</span>}
        </div>
        {/* the shopper's chosen language only; the product page shows both names */}
        <h3 lang={locale}>{p.name[locale]}</h3>
        {p.reviewCount > 0 && (
          <span
            className="product-rating"
            aria-label={`${p.rating.toFixed(1)} out of 5 from ${p.reviewCount} reviews`}
          >
            ★ {p.rating.toFixed(1)} <small>({p.reviewCount})</small>
          </span>
        )}
        <span className="pack">{v.label}</span>
      </Link>
      <div className="price-row">
        <div className="price">
          <strong>{formatPrice(v.pricePaise)}</strong>
          {off > 0 && <del>{formatPrice(v.mrpPaise)}</del>}
        </div>
        <QuickAdd variantId={v.id} pricePaise={v.pricePaise} available={v.available} max={v.maxQuantity} name={p.name.en} />
      </div>
    </article>
  );
}
