import Image from "next/image";
import Link from "next/link";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { discountPercent, formatPrice } from "@/lib/display";
import { InBasket, QuickAdd } from "./quick-add";
import { ShareSheet } from "./share-sheet";
import { WishlistButton } from "./wishlist-button";
import { AisleIcon } from "./aisle-icon";
import { ProviderLine } from "./provider-line";

/** What a product card shows: the shop's lists send it from the server, the category page from the catalogue it loaded. */
export type CardItem = Pick<CatalogItem, "id" | "slug" | "name" | "brand" | "image" | "categorySlug" | "provider" | "rating" | "reviewCount"> & {
  variants: Pick<CatalogItem["variants"][number], "id" | "label" | "pricePaise" | "mrpPaise" | "available" | "maxQuantity">[];
};

/**
 * A product card, drawn on the server (ProductCard) or in the browser (the category page). It has
 * nothing of its own to look up: whether the shopper saved it comes in as `saved`.
 */
export function ProductCardView({
  product: p,
  locale = "en",
  saved,
  eager = false,
}: {
  product: CardItem;
  locale?: "en" | "mr";
  saved: boolean;
  eager?: boolean;
}) {
  const isSaved = saved;
  // the pack the card shows and adds: the first that can be bought now, else the first
  const v = p.variants.find((pack) => pack.available > 0) ?? p.variants[0];
  const image = p.image ?? productImages[p.slug];
  const off = discountPercent(v.pricePaise, v.mrpPaise);
  const mr = locale === "mr";
  const name = p.name[locale];
  return (
    <article className={v.available ? "product-card" : "product-card sold-out"}>
      <WishlistButton productId={p.id} name={p.name[locale]} saved={isSaved} mr={locale === "mr"} />
      <Link href={`/products/${p.slug}`} className="product-link">
        <div className={`product-art${image ? "" : " quiet"}`}>
          {image ? (
            <Image
              src={image}
              alt="" /* the name is the next line of the link; the product page carries the photo note */
              fill
              sizes="(max-width: 760px) 45vw, 220px"
              loading={eager ? "eager" : "lazy"}
              className="product-photo"
            />
          ) : (
            <AisleIcon slug={p.categorySlug} />
          )}
          {off > 0 && <span className="discount">−{off}%</span>}
          {!v.available && <span className="stock-badge">{locale === "mr" ? "संपले" : "Sold out"}</span>}
        </div>
        <h3 lang={locale}>{p.name[locale]}</h3>
        {/* one or two reviews say little; the card shows a rating from three */}
        {p.reviewCount >= 3 && (
          <span
            className="product-rating"
            aria-label={`${p.rating.toFixed(1)} out of 5 from ${p.reviewCount} reviews`}
          >
            ★ {p.rating.toFixed(1)} <small>({p.reviewCount})</small>
          </span>
        )}
        <ProviderLine provider={p.provider} mr={locale === "mr"} />
        <span className="pack">
          {v.label}
          {p.variants.length > 1 && <b className="pack-options">{mr ? `${p.variants.length} पर्याय` : `${p.variants.length} options`}</b>}
        </span>
      </Link>
      <div className="price-row">
        <div className="price">
          <strong>{formatPrice(v.pricePaise)}</strong>
          {off > 0 && <del>{formatPrice(v.mrpPaise)}</del>}
        </div>
        {p.variants.length > 1 && v.available ? (
          // several packs: ADD opens the list of them, each with its own price and stepper
          <ShareSheet
            label={mr ? `${name}: पॅक निवडा` : `Choose a pack of ${name}`}
            title={name}
            closeLabel={mr ? "बंद करा" : "Close"}
            triggerClassName="add-button"
            trigger={
              <>
                {mr ? "जोडा" : "Add"}
                <InBasket ids={p.variants.map((pack) => pack.id)} />
              </>
            }
          >
            <ul className="pack-choices">
              {p.variants.map((pack) => (
                <li key={pack.id}>
                  <span>
                    <strong>{pack.label}</strong>
                    <span className="price">
                      {formatPrice(pack.pricePaise)}
                      {pack.pricePaise < pack.mrpPaise && <del>{formatPrice(pack.mrpPaise)}</del>}
                    </span>
                  </span>
                  <QuickAdd variantId={pack.id} pricePaise={pack.pricePaise} available={pack.available} max={pack.maxQuantity} name={`${name}, ${pack.label}`} mr={mr} />
                </li>
              ))}
            </ul>
          </ShareSheet>
        ) : (
          <QuickAdd variantId={v.id} pricePaise={v.pricePaise} available={v.available} max={v.maxQuantity} name={name} mr={mr} />
        )}
      </div>
    </article>
  );
}
