import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Star, Truck } from "lucide-react";
import { productImages } from "@/lib/catalog/images";
import { currentUser } from "@/lib/auth/session";
import { ActionForm } from "@/components/action-form";
import { PolicyNotice } from "@/components/policy-notice";
import { catalogCategories, productBySlug } from "@/lib/catalog/queries";
import { WishlistButton } from "@/components/wishlist-button";
import { currentLocale } from "@/lib/i18n";
import { ProductReview } from "@/lib/reviews/models";
import { Order } from "@/lib/commerce/models";
import { ProductVariant, User } from "@/lib/db/models";
import { WishlistItem } from "@/lib/engagement/models";
import { reviewAction, reportReviewAction } from "@/lib/reviews/actions";
import { recommendationsFor } from "@/lib/catalog/recommendations";
import { ProductCard } from "@/components/product-card";
import { deliveryRules } from "@/lib/commerce/service";
import { ProductGallery } from "@/components/product-gallery";
import { ProductQuantity } from "@/components/quick-add";
import { orderedPhotos } from "@/lib/catalog/photos";
import { discountPercent, formatPrice, minutesUntilCutoff } from "@/lib/display";
import { getEnv } from "@/lib/env";
import { listsFor } from "@/lib/lists/service";
import { AddToList } from "@/components/add-to-list";
import { SaveToBoard } from "@/components/save-to-board";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await productBySlug((await params).slug);
  if (!p) return { title: "Product not found" };
  const v = p.variants[0];
  return {
    title: `${p.name.en} – ${formatPrice(v.pricePaise)}`,
    description: `${p.name.en} (${v.label}) from Agarwal General Stores, delivered across Nagothane and nearby areas. ${p.description.en}`.slice(0, 300),
  };
}
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  // each round asks for everything that doesn't wait on something else, all at once
  const [user, { slug }, { lang: requestedLocale }, savedLocale] = await Promise.all([
    currentUser(),
    params,
    searchParams,
    currentLocale(),
  ]);
  const p = await productBySlug(slug);
  if (!p) notFound();
  const locale = requestedLocale ? (requestedLocale === "mr" ? "mr" : "en") : savedLocale;
  const mr = locale === "mr";
  const image = p.image ?? productImages[p.slug];
  const [reviews, related, rules, saved, categories, myLists, variantIds] = await Promise.all([
    ProductReview.find({ productId: p.id, status: "published" })
      .sort({ createdAt: -1 })
      .limit(20),
    recommendationsFor({
      customerId: user?.id,
      category: p.categorySlug,
      excludeSlug: p.slug,
      limit: 5,
    }),
    deliveryRules(),
    user
      ? WishlistItem.exists({ customerId: user.id, productId: p.id })
      : null,
    catalogCategories(),
    user ? Promise.all([listsFor(user.id, "basket"), listsFor(user.id, "board")]) : null,
    // every pack, hidden ones too: someone who bought a pack since hidden can still review
    user ? ProductVariant.find({ productId: p.id }).distinct("_id") : [],
  ]);
  const [myBaskets, myBoards] = myLists ?? [null, null];
  const listChoices = myBaskets ? [...myBaskets.owned, ...myBaskets.shared] : [];
  const packIds = new Set(p.variants.map((v) => v.id));
  const boardChoices = myBoards
    ? [...myBoards.owned, ...myBoards.shared].map((board) => ({
        id: String(board._id),
        name: board.name as string,
        has: board.items.some((item: { variantId: unknown }) => packIds.has(String(item.variantId))),
      }))
    : [];
  const categoryName =
    categories.find((category) => category.slug === p.categorySlug)?.[locale] ?? p.categorySlug;
  // the shop is the only seller; saying so is a row of noise
  const specs = p.specifications.filter((spec) => spec.label.en !== "Seller");
  const [reviewUsers, delivered] = await Promise.all([
    User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name"),
    user
      ? Order.exists({ customerId: user.id, deliveryStatus: "delivered", "items.variantId": { $in: variantIds } })
      : null,
  ]);
  const canReview = user !== null && Boolean(delivered);
  // every published review counts, as on the product cards; only the latest 20 are listed below
  const averageRating = p.reviewCount ? p.rating : 0;
  // the cutoff is an IST hour; the server clock is UTC on Vercel
  const deliveryDay = minutesUntilCutoff(rules.cutoffHour) > 0 ? "today" : "tomorrow";
  const v = p.variants[0];
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name.en,
    description: p.description.en,
    brand: { "@type": "Brand", name: p.brand },
    ...(image ? { image: [image] } : {}),
    offers: {
      "@type": "Offer",
      url: `${getEnv().APP_ORIGIN}/products/${p.slug}`,
      priceCurrency: "INR",
      price: (v.pricePaise / 100).toFixed(2),
      availability: `https://schema.org/${v.available > 0 ? "InStock" : "OutOfStock"}`,
    },
  };
  return (
    <section className="page-container">
      <script
        type="application/ld+json"
        // escaped so a product name can never close the script tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/catalog">{mr ? "सर्व उत्पादने" : "All products"}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={`/catalog?category=${p.categorySlug}&lang=${locale}`}>
          {categoryName}
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{p.name[locale]}</span>
      </nav>
      <div className="product-detail">
        <ProductGallery
          images={orderedPhotos(p).length ? orderedPhotos(p) : image ? [image] : []}
          name={p.name.en}
          category={p.categorySlug}
        />
        <div className="product-info">
          <div className="product-title-row">
            <span className="eyebrow">{categoryName}</span>
            {user ? (
              <SaveToBoard productId={p.id} variantId={p.variants[0].id} saved={Boolean(saved)} boards={boardChoices} mr={mr} />
            ) : (
              <WishlistButton productId={p.id} name={p.name[locale]} saved={Boolean(saved)} />
            )}
          </div>
          <h1 lang={locale}>{p.name[locale]}</h1>
          <p className="muted" lang={mr ? "en" : "mr"}>
            {p.name[mr ? "en" : "mr"]}
          </p>
          <div className="product-assurance-row">
            <span>
              <Star size={14} aria-hidden="true" />
              {averageRating ? `${averageRating.toFixed(1)} · ${p.reviewCount} verified ${p.reviewCount === 1 ? "review" : "reviews"}` : "New in store"}
            </span>
            <span>
              <Truck size={14} aria-hidden="true" /> Delivery {deliveryDay}
            </span>
          </div>
          <p className="description">{p.description[locale]}</p>
          {p.variants.length > 1 && (
            <h2 className="variant-heading">{mr ? "पॅक आकार निवडा" : "Choose your pack"}</h2>
          )}
          <div className="variant-list">
            {p.variants.map((v) => {
              const off = discountPercent(v.pricePaise, v.mrpPaise);
              const max = Math.min(v.maxQuantity, v.available);
              return (
                <div className="panel variant-card" key={v.id}>
                  <div className="variant-info">
                    <strong>{v.label}</strong>
                    <span className="variant-price">
                      <b>{formatPrice(v.pricePaise)}</b>
                      {off > 0 && (
                        <>
                          <del>{formatPrice(v.mrpPaise)}</del>
                          <em>−{off}%</em>
                        </>
                      )}
                    </span>
                    <small className="muted">
                      {v.available > 0
                        ? `${v.available} available · up to ${v.maxQuantity} per order`
                        : "Currently out of stock"}
                    </small>
                  </div>
                  {/* tapping again adds one more; it used to set the basket to the typed number */}
                  {v.available > 0 ? (
                    <ProductQuantity
                      variantId={v.id}
                      pricePaise={v.pricePaise}
                      available={v.available}
                      max={max}
                      name={`${p.name[locale]} (${v.label})`}
                      mr={mr}
                    />
                  ) : (
                    <span className="status-pill">Sold out</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="notice product-delivery-note">
            Live stock and delivery charges are confirmed at checkout.
          </p>
          {user && (
            <AddToList
              mr={mr}
              variants={p.variants.map((v) => ({ id: v.id, label: v.label, price: formatPrice(v.pricePaise) }))}
              lists={listChoices.map((list) => ({ id: String(list._id), name: list.name }))}
            />
          )}
          {specs.length > 0 && (
            <dl className="product-specs">
              {specs.map((specification) => (
                <div key={specification.label.en}>
                  <dt>{specification.label[locale]}</dt>
                  <dd>{specification.value[locale]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {(reviews.length > 0 || canReview) && (
      <section className="section reviews-section" id="reviews">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Verified purchases</span>
            <h2>Ratings &amp; reviews</h2>
          </div>
          {averageRating > 0 && <strong>{averageRating.toFixed(1)} ★</strong>}
        </div>
        {canReview && (
          <div className="panel review-form-card">
            <h3>Share your experience</h3>
            <ActionForm action={reviewAction} submit="Publish verified review">
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="slug" value={p.slug} />
              <label>
                Rating
                <select name="rating" defaultValue="5">
                  <option value="5">5 — Excellent</option>
                  <option value="4">4 — Good</option>
                  <option value="3">3 — Okay</option>
                  <option value="2">2 — Poor</option>
                  <option value="1">1 — Very poor</option>
                </select>
              </label>
              <label>
                Review title
                <input name="title" maxLength={80} />
              </label>
              <label>
                Your review
                <textarea name="body" rows={4} maxLength={1000} />
              </label>
              <PolicyNotice kind="review" />
            </ActionForm>
          </div>
        )}
        <div className="reviews-grid">
          {reviews.map((review) => {
            const author = reviewUsers.find(
              (candidate) => String(candidate._id) === String(review.customerId),
            );
            return (
              <article className="panel review-card" key={String(review._id)}>
                <div>
                  <strong aria-label={`${review.rating} out of 5`}>
                    {"★".repeat(review.rating)}
                  </strong>
                  <span className="verified-chip">Verified purchase</span>
                </div>
                {review.title && <h3>{review.title}</h3>}
                {review.body && <p>{review.body}</p>}
                <small>{author?.name ?? "Verified customer"}</small>
                {user && String(review.customerId) !== user.id && (
                  <details>
                    <summary>Report</summary>
                    <ActionForm action={reportReviewAction} submit="Send report">
                      <input type="hidden" name="reviewId" value={String(review._id)} />
                      <label>
                        Reason
                        <input name="reason" minLength={5} maxLength={300} required />
                      </label>
                    </ActionForm>
                  </details>
                )}
              </article>
            );
          })}
          {!reviews.length && (
            <div className="panel empty-state">
              <h3>No reviews yet</h3>
              <p>Customers who received this item can share the first verified review.</p>
            </div>
          )}
        </div>
      </section>
      )}
      {related.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">You may also like</span>
              <h2>More from your store</h2>
            </div>
          </div>
          <div className="product-grid">
            {related.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
