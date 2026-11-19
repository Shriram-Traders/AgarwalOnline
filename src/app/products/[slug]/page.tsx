import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, BellRing, ChevronRight, Star, Store, Truck } from "lucide-react";
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
import { waitingFor } from "@/lib/engagement/stock-alerts";
import { stockAlertAction } from "@/lib/engagement/actions";
import { reviewAction, reportReviewAction } from "@/lib/reviews/actions";
import { relatedFor } from "@/lib/catalog/related";
import { RelatedRows } from "@/components/related-rows";
import { deliveryRules } from "@/lib/commerce/service";
import { ProductGallery } from "@/components/product-gallery";
import { ProductQuantity } from "@/components/quick-add";
import { orderedPhotos } from "@/lib/catalog/photos";
import { discountPercent, formatPrice } from "@/lib/display";
import { deliveryPromise } from "@/lib/commerce/delivery";
import { getEnv } from "@/lib/env";
import { jsonLd, productDescription, productJsonLd } from "@/lib/seo";
import { listsFor } from "@/lib/lists/service";
import { AddToList } from "@/components/add-to-list";
import { SaveToBoard } from "@/components/save-to-board";
import { taxProfile } from "@/lib/tax/profile";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await productBySlug((await params).slug);
  if (!p) return { title: "Product not found" };
  const v = p.variants[0];
  const photo = orderedPhotos(p)[0] ?? productImages[p.slug];
  const title = `${p.name.en} – ${formatPrice(v.pricePaise)}`;
  return {
    // Google shows about 60 characters: a long name keeps its price and loses the shop's name
    title: `${title} | Agarwal Online`.length > 60 ? { absolute: title } : title,
    description: productDescription(p),
    alternates: { canonical: `/products/${p.slug}` },
    ...(photo ? { openGraph: { images: [photo] } } : {}),
  };
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  // each round asks for everything that doesn't wait on something else, all at once
  const [user, { slug }, locale] = await Promise.all([currentUser(), params, currentLocale()]);
  const p = await productBySlug(slug);
  if (!p) notFound();
  const mr = locale === "mr";
  const image = p.image ?? productImages[p.slug];
  const [reviews, related, rules, saved, categories, myLists, variantIds, seller, waiting] = await Promise.all([
    ProductReview.find({ productId: p.id, status: "published" })
      .sort({ createdAt: -1 })
      .limit(20),
    relatedFor({ product: p, customerId: user?.id }),
    deliveryRules(),
    user
      ? WishlistItem.exists({ customerId: user.id, productId: p.id })
      : null,
    catalogCategories(),
    user ? Promise.all([listsFor(user.id, "basket"), listsFor(user.id, "board")]) : null,
    // every pack, hidden ones too: someone who bought a pack since hidden can still review
    user ? ProductVariant.find({ productId: p.id }).distinct("_id") : [],
    // another shop provides it: Product info names who sells it, which is still us
    p.provider ? taxProfile() : null,
    // sold-out packs they've asked to hear about
    waitingFor(user?.id, p.variants.filter((v) => v.available <= 0).map((v) => v.id)),
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
  // the other shelves it also shows on, by name
  const alsoOn = categories.filter((category) => p.alsoOn.includes(category.slug));
  // the shop is the only seller; saying so is a row of noise
  const specs = p.specifications.filter((spec) => spec.label.en !== "Seller");
  const [reviewUsers, delivered] = await Promise.all([
    // most products have no reviews yet: no names to look up
    reviews.length ? User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name") : [],
    user
      ? Order.exists({ customerId: user.id, deliveryStatus: "delivered", "items.variantId": { $in: variantIds } })
      : null,
  ]);
  const canReview = user !== null && Boolean(delivered);
  // every published review counts, as on the product cards; only the latest 20 are listed below
  const averageRating = p.reviewCount ? p.rating : 0;
  // the cutoff is an IST hour; the server clock is UTC on Vercel
  // skips holidays and closed dates, as checkout does: "today", "tomorrow" or "on Monday"
  const deliveryDay = deliveryPromise(new Date(), rules).now;
  const photos = orderedPhotos(p).length ? orderedPhotos(p) : image ? [image] : [];
  const structuredData = productJsonLd(
    p,
    getEnv().APP_ORIGIN,
    categories.find((category) => category.slug === p.categorySlug)?.en ?? p.categorySlug,
    photos,
  );
  return (
    <section className="page-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/catalog">{mr ? "सर्व उत्पादने" : "All products"}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={`/catalog?category=${p.categorySlug}`}>
          {categoryName}
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{p.name[locale]}</span>
      </nav>
      <div className="product-detail">
        <ProductGallery
          images={photos}
          name={p.name.en}
          category={p.categorySlug}
          mr={mr}
        />
        <div className="product-info">
          <div className="product-title-row">
            <span className="eyebrow">{categoryName}</span>
            {user ? (
              <SaveToBoard productId={p.id} variantId={p.variants[0].id} saved={Boolean(saved)} boards={boardChoices} mr={mr} />
            ) : (
              <WishlistButton productId={p.id} name={p.name[locale]} saved={Boolean(saved)} mr={mr} />
            )}
          </div>
          <h1>{p.name[locale]}</h1>
          {alsoOn.length > 0 && (
            <p className="also-shelves">
              Also on:
              {alsoOn.map((shelf) => (
                <Link key={shelf.slug} href={`/catalog?category=${shelf.slug}`}>
                  {shelf[locale]}
                </Link>
              ))}
            </p>
          )}
          <div className="product-assurance-row">
            <span>
              <Star size={14} aria-hidden="true" />
              {averageRating
                ? mr
                  ? `${averageRating.toFixed(1)} · ${p.reviewCount} खात्रीशीर पुनरावलोकने`
                  : `${averageRating.toFixed(1)} · ${p.reviewCount} verified ${p.reviewCount === 1 ? "review" : "reviews"}`
                : mr
                  ? "दुकानात नवीन"
                  : "New in store"}
            </span>
            {/* no delivery promise for something that can't be ordered */}
            {p.variants.some((v) => v.available > 0) && (
              <span>
                <Truck size={14} aria-hidden="true" />{" "}
                {mr ? `डिलिव्हरी ${deliveryDay === "today" ? "आज" : "उद्या"}` : `Delivery ${deliveryDay}`}
              </span>
            )}
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
                        ? mr
                          ? `${v.available} उपलब्ध · एका ऑर्डरमध्ये जास्तीत जास्त ${v.maxQuantity}`
                          : `${v.available} available · up to ${v.maxQuantity} per order`
                        : mr
                          ? "सध्या स्टॉकमध्ये नाही"
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
                    <div className="stock-alert">
                      <span className="status-pill">{mr ? "संपले" : "Sold out"}</span>
                      {/* one notification when it's back; signed out, sign in first and come back here */}
                      {!user ? (
                        <Link className="secondary-button" href={`/login?then=${encodeURIComponent(`/products/${p.slug}`)}`}>
                          <Bell size={16} aria-hidden="true" /> Tell me when it’s back
                        </Link>
                      ) : waiting.has(v.id) ? (
                        <ActionForm action={stockAlertAction} submit="Don’t tell me" className="stock-alert-form" buttonClassName="text-button">
                          <p className="stock-alert-on">
                            <BellRing size={16} aria-hidden="true" /> We’ll tell you when it’s back
                          </p>
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="want" value="0" />
                        </ActionForm>
                      ) : (
                        <ActionForm
                          action={stockAlertAction}
                          submit="Tell me when it’s back"
                          submitIcon={<Bell size={16} aria-hidden="true" />}
                          className="stock-alert-form"
                          buttonClassName="secondary-button"
                        >
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="want" value="1" />
                          <input type="hidden" name="then" value={`/products/${p.slug}`} />
                        </ActionForm>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="notice product-delivery-note">
            {mr ? "स्टॉक आणि डिलिव्हरी शुल्क चेकआउटला निश्चित होतात." : "Live stock and delivery charges are confirmed at checkout."}
          </p>
          {user && (
            <AddToList
              mr={mr}
              variants={p.variants.map((v) => ({ id: v.id, label: v.label, price: formatPrice(v.pricePaise) }))}
              lists={listChoices.map((list) => ({ id: String(list._id), name: list.name }))}
            />
          )}
          {(specs.length > 0 || p.provider) && (
            <section className="product-specs" aria-labelledby="product-info-title">
              <h2 id="product-info-title" className="product-specs-title">
                {mr ? "उत्पादनाची माहिती" : "Product info"}
              </h2>
              <dl>
              {p.provider && (
                <>
                  <div className="provider-row">
                    <dt>{mr ? "पुरवठादार" : "Provided by"}</dt>
                    <dd>
                      <Store size={15} aria-hidden="true" />
                      {p.provider.name}, {p.provider.town}
                    </dd>
                  </div>
                  <div>
                    <dt>{mr ? "विक्रेता" : "Sold by"}</dt>
                    <dd>{seller?.legalName ?? "Agarwal General Stores"}</dd>
                  </div>
                </>
              )}
              {specs.map((specification) => (
                <div key={specification.label.en}>
                  <dt>{specification.label[locale]}</dt>
                  <dd>{specification.value[locale]}</dd>
                </div>
              ))}
              </dl>
            </section>
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
      <RelatedRows product={p} rows={related} categoryName={categoryName} locale={locale} />
    </section>
  );
}
