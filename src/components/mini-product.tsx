import Image from "next/image";
import Link from "next/link";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/display";
import { AisleIcon } from "./aisle-icon";
import { QuickAdd } from "./quick-add";

/** A small product tile for rows on the basket page: photo, name, price and the shop's Add button. */
export function MiniProduct({ product }: { product: CatalogItem }) {
  const variant = product.variants.find((v) => v.available > 0) ?? product.variants[0];
  const image = product.image ?? productImages[product.slug];
  return (
    <article className="mini-product">
      <Link href={`/products/${product.slug}`} className="mini-product-link">
        <span className="mini-product-art">
          {image ? (
            <Image src={image} alt="" fill sizes="120px" className="product-photo" />
          ) : (
            <AisleIcon slug={product.categorySlug} />
          )}
        </span>
        <span className="mini-product-name">{product.name.en}</span>
        <small>{variant.label}</small>
      </Link>
      <div className="mini-product-buy">
        <span className="price">
          <strong>{formatPrice(variant.pricePaise)}</strong>
          {variant.mrpPaise > variant.pricePaise && <del>{formatPrice(variant.mrpPaise)}</del>}
        </span>
        <QuickAdd
          variantId={variant.id}
          pricePaise={variant.pricePaise}
          available={variant.available}
          max={variant.maxQuantity}
          name={product.name.en}
        />
      </div>
    </article>
  );
}
