import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { AisleIcon } from "@/components/aisle-icon";
import { deliveryRules } from "@/lib/commerce/service";
import { categoryImages, productImages } from "@/lib/catalog/images";
import { catalog, catalogCategories, catalogSections, shelfPhotos } from "@/lib/catalog/queries";
import { ProductCard } from "@/components/product-card";
import { buyAgain as buyAgainFor } from "@/lib/catalog/buy-again";
import { DeliveryPromise } from "@/components/delivery-promise";
import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { liveAreaFees, liveAreaNames } from "@/lib/commerce/areas";
import { homeFaq } from "@/lib/home-faq";
import { LegalText } from "@/components/legal-text";
import { familyOf } from "@/lib/family/service";
import { childKits } from "@/lib/family/kits";
import { classLabel } from "@/lib/family/models";
import { advertisable, liveOffers, offerSaving, runningAt } from "@/lib/promotions/service";
import { deliveryPromise } from "@/lib/commerce/delivery";
import { formatPrice, minutesUntilCutoff } from "@/lib/display";
import { taxProfile } from "@/lib/tax/profile";
import { jsonLd, storeJsonLd, websiteJsonLd } from "@/lib/seo";
import { getEnv } from "@/lib/env";
import { paymentsEnabled } from "@/lib/payments/provider";
import { doorUpi, fill, frontWords, shopSettings } from "@/lib/settings/shop";
export const dynamic = "force-dynamic";
// the title and description are the root layout's; shared links with tracking tags fold into one address
export const metadata = { alternates: { canonical: "/" } };

const copy = {
  en: {
    kitEyebrow: (name: string) => `For ${name}`,
    kitTitle: (className: string) => `${className} kit from the store`,
    kitCta: "See the kit",
    andMore: " and more",
    faq: "Questions people ask",
    productsCount: (n: number) => (n === 1 ? "1 product" : `${n} products`),
    pinLabel: "Check delivery at your PIN code",
    pinHint: "Six digits. Used only to check serviceability.",
    checkPin: "Check",
    freeFrom: (amount: string) => `Free delivery from ${amount}`,
    payment: (online: boolean) => (online ? "Cash on delivery or pay online" : "Cash on delivery"),
    benefitsLabel: "Delivery and payment facts",
    offers: "Offers running now",
    automatic: "Applied automatically at checkout",
    everyBasket: "on every basket",
    minimum: (amount: string) => `on baskets of ${amount} or more`,
    percentOff: (value: number) => `${value}% off`,
    amountOff: (amount: string) => `${amount} off`,
    aisles: "Shop by category",
    allAisles: (n: number) => `All ${n} categories`,
    usuals: "Your usuals",
    usualsTitle: "Buy it again",
    pastOrders: "Past orders",
    popular: "Popular in the shop",
    seeAll: "See all",
    newIn: "New in store",
    storyEyebrow: "How delivery works",
    step1: (cutoff: string) => `Order before ${cutoff}`,
    step1Note: "Anything ordered after that goes out tomorrow.",
    step2: "Packed at the counter",
    step2Note: "By the same people who serve you in store.",
    step3: "At your door the same day",
    step3Note: (online: boolean) => (online ? "Pay in cash when it arrives, or online." : "Pay in cash when it arrives."),
  },
  mr: {
    kitEyebrow: (name: string) => `${name} साठी`,
    kitTitle: (className: string) => `${className} शालेय संच`,
    kitCta: "संच पाहा",
    andMore: " आणि आणखी",
    faq: "नेहमीचे प्रश्न",
    productsCount: (n: number) => `${n} उत्पादने`,
    pinLabel: "तुमच्या पिन कोडवर वितरण तपासा",
    pinHint: "सहा अंक. फक्त वितरण उपलब्धता तपासण्यासाठी.",
    checkPin: "तपासा",
    freeFrom: (amount: string) => `${amount} पासून मोफत वितरण`,
    payment: (online: boolean) => (online ? "रोख किंवा ऑनलाइन पेमेंट" : "वितरणावेळी रोख"),
    benefitsLabel: "वितरण आणि पेमेंट माहिती",
    offers: "सध्याच्या ऑफर",
    automatic: "चेकआउटला आपोआप लागू",
    everyBasket: "प्रत्येक बास्केटवर",
    minimum: (amount: string) => `${amount} किंवा अधिकच्या बास्केटवर`,
    percentOff: (value: number) => `${value}% सूट`,
    amountOff: (amount: string) => `${amount} सूट`,
    aisles: "विभागानुसार खरेदी",
    allAisles: (n: number) => `सर्व ${n} विभाग`,
    usuals: "तुमच्या नेहमीच्या वस्तू",
    usualsTitle: "पुन्हा खरेदी करा",
    pastOrders: "मागील ऑर्डर",
    popular: "दुकानातील लोकप्रिय",
    seeAll: "सर्व पाहा",
    newIn: "दुकानात नवीन",
    storyEyebrow: "वितरण कसे चालते",
    step1: (cutoff: string) => `${cutoff} पूर्वी ऑर्डर करा`,
    step1Note: "त्यानंतरच्या ऑर्डर उद्या पाठवल्या जातात.",
    step2: "काउंटरवर पॅक",
    step2Note: "दुकानात तुम्हाला भेटणारी तीच माणसे.",
    step3: "त्याच दिवशी तुमच्या दारी",
    step3Note: (online: boolean) => (online ? "आल्यावर रोख द्या, किंवा ऑनलाइन." : "आल्यावर रोख द्या."),
  },
} as const;

/** Uniform aisle tile: square art above, bilingual label below. */
function AisleTile({
  category,
  locale,
  eager = false,
  fallback,
  within,
}: {
  category: { slug: string; en: string; mr: string };
  locale: "en" | "mr";
  eager?: boolean;
  /** An aisle without a chosen photo shows its most popular product's. */
  fallback?: string;
  /** The section the tile sits under: the shelf opens with that section's rail. */
  within?: string;
}) {
  const photo = categoryImages[category.slug] ?? fallback;
  return (
    <Link
      href={`/catalog?${new URLSearchParams({ category: category.slug, ...(within ? { in: within } : {}) })}`}
      className={`aisle-tile ${photo ? "photo" : "quiet"}`}
    >
      <span className="aisle-art">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(max-width: 760px) 25vw, (max-width: 1100px) 25vw, 200px"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <AisleIcon slug={category.slug} />
        )}
      </span>
      <span className="aisle-label">
        <strong>{category[locale]}</strong>
      </span>
    </Link>
  );
}

function Section({
  id,
  title,
  subtitle,
  link,
  linkLabel,
  count,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  link: string;
  linkLabel: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle && <span className="muted">{subtitle}</span>}
        </div>
        <Link href={link}>
          {linkLabel}
          {count ? ` (${count})` : ""} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function Home() {
  const now = new Date();
  const [products, newest, user, categories, sections, photos, locale, rules] = await Promise.all([
    catalog(),
    catalog({ sort: "new" }),
    currentUser(),
    catalogCategories(),
    catalogSections(),
    shelfPhotos(),
    currentLocale(),
    deliveryRules(),
  ]);
  // everything that only needs to know who's signed in, in one round
  const [family, activeOffers, areaDocs, buyAgain, shop, front, areaFees, upiAtDoor] = await Promise.all([
    user ? familyOf(user.id) : null,
    // a private code handed out in person, or one used up, is never advertised here
    liveOffers().then((offers) => offers.filter(runningAt(now)).filter(advertisable).slice(0, 2)),
    liveAreaNames(),
    // what they buy most, from their recent orders (it used to be only the last order, even a cancelled one)
    user ? buyAgainFor(user.id, products) : [],
    taxProfile(),
    shopSettings("storefront"),
    liveAreaFees(),
    doorUpi(),
  ]);
  const t = copy[locale];
  const online = paymentsEnabled();
  const cutoff = `${rules.cutoffHour % 12 || 12} ${rules.cutoffHour >= 12 ? "PM" : "AM"}`;
  const freeFrom = formatPrice(rules.freeThresholdPaise);
  const faq = homeFaq(locale, { areas: areaDocs, feesPaise: areaFees, cutoff, freeFromPaise: rules.freeThresholdPaise, online, upi: Boolean(upiAtDoor) });
  // a child's class kit leads the page for their family: the first child whose school has one with us
  type Child = { _id: unknown; name: string; school: string; className: string; year: string };
  const pupils: Child[] = (family?.children ?? []).filter((child: Child) => child.school);
  const kits = pupils.length ? await childKits({ children: pupils }) : [];
  const kitChild = pupils.find((child) => kits.find((info) => info.childId === String(child._id))?.kit);
  const kit = kitChild ? kits.find((info) => info.childId === String(kitChild._id))!.kit! : null;
  const areas = areaDocs.join(" · ");
  const bestsellers = products.filter((product) => product.bestseller);
  // 16 card slots used to be filled by 11 products, with four of them repeated
  // across three rows. Each row now takes the next unshown item, so the
  // catalogue reads as deep as it actually is.
  const shown = new Set<string>();
  // Unsplash ids start with a timestamp: frames from one shoot share the seconds
  const photoOf = (product: (typeof products)[number]) =>
    (product.image ?? productImages[product.slug] ?? "").replace(/(photo-\d{10})[^?]*/, "$1").split("?")[0];
  // two products share one shoot in places; side by side they read as a bug
  const spread = (list: typeof products) => {
    const out: typeof products = [];
    const rest = [...list];
    while (rest.length) {
      const last = out[out.length - 1];
      const i = Math.max(0, rest.findIndex((p) => !last || photoOf(p) !== photoOf(last)));
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  };
  const take = (list: typeof products, count: number) => {
    const picked = list.filter((product) => !shown.has(product.id)).slice(0, count);
    for (const product of picked) shown.add(product.id);
    return spread(picked);
  };
  const buyAgainRow = take(buyAgain, 5);
  const popular = take(bestsellers.length ? bestsellers : products, 10);
  const newRow = take(newest, 10);
  /** Accurate offer terms, built from the promotion record rather than written copy. */
  const describe = (offer: {
    discountType: "fixed" | "percentage";
    discountValue: number;
    maximumDiscountPaise?: number;
    minimumSubtotalPaise: number;
  }) => {
    // "10% off, up to ₹50": the cap is part of the offer
    const amount = offerSaving(offer);
    const condition = offer.minimumSubtotalPaise
      ? t.minimum(formatPrice(offer.minimumSubtotalPaise))
      : t.everyBasket;
    return `${amount} ${condition}`;
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([websiteJsonLd(getEnv().APP_ORIGIN), storeJsonLd(shop, areaDocs, getEnv().APP_ORIGIN)]) }}
      />
      <section className="opener" aria-labelledby="welcome-title">
        <span className="hero-badge">{frontWords(front, "heroBadge", locale)}</span>
        <h1 id="welcome-title" className="big-q">
          {/* the owners' words from Customize → Shop front, or the shop's own */}
          {fill(frontWords(front, "heroTitle", locale), { cutoff })}{" "}
          <em>{fill(frontWords(front, "heroHighlight", locale), { cutoff })}</em>
        </h1>
        <p>{frontWords(front, "heroLead", locale)}</p>
        <DeliveryPromise
          cutoffHour={rules.cutoffHour}
          initialMinutes={minutesUntilCutoff(rules.cutoffHour, now)}
          locale={locale}
          promise={deliveryPromise(now, rules)}
        />
        {/* a child's class kit, for their family: one tap from the first screen */}
        {kit && kitChild && (
          <Link href="/account/family" className="kit-slot">
            <span className="eyebrow">{t.kitEyebrow(kitChild.name)}</span>
            <strong>{t.kitTitle(classLabel(kitChild.className, locale === "mr"))}</strong>
            <span className="slot-line">
              {t.productsCount(kit.lines)} · {formatPrice(kit.totalPaise)}
            </span>
            <span className="slot-cta">
              {t.kitCta} <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        )}
      </section>
      <div className="page-container home">
        {sections.length > 0 ? (
          // one big block per section: its name, a few of its shelves, their photos; it opens the section's first shelf
          <section className="section shop-map" aria-labelledby="aisles-title">
            <h2 id="aisles-title" className="sr-only">
              {t.aisles}
            </h2>
            <div className="bento">
              {sections.map((section, index) => {
                // the first block spans the row; so does the last when it would otherwise sit alone
                const big = index === 0 || (index === sections.length - 1 && sections.length % 2 === 0);
                const names = section.shelves.map((shelf) => shelf[locale]);
                const shown = big ? 3 : 2;
                const shots = section.shelves
                  .map((shelf) => categoryImages[shelf.slug] ?? photos.get(shelf.slug))
                  .filter((photo): photo is string => Boolean(photo))
                  .slice(0, big ? 4 : 2);
                return (
                  <Link
                    key={section.slug || "more"}
                    href={`/catalog?${new URLSearchParams({ category: section.shelves[0].slug, ...(section.slug ? { in: section.slug } : {}) })}`}
                    className={`section-block tint-${(index % 5) + 1}${big ? " big" : ""}`}
                  >
                    <h3>{section[locale]}</h3>
                    <p>
                      {names.slice(0, shown).join(", ")}
                      {names.length > shown ? t.andMore : ""}
                    </p>
                    <span className="block-go">
                      <ArrowRight size={16} aria-hidden="true" />
                    </span>
                    <span className="block-stack">
                      {shots.map((photo, place) => (
                        <Image key={photo + place} src={photo} alt="" width={88} height={88} loading={index < 3 ? "eager" : "lazy"} />
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          // no sections yet: every shelf as a picture tile
          <section className="section shop-map" aria-labelledby="aisles-title">
            <div className="section-heading">
              <div>
                <h2 id="aisles-title">{t.aisles}</h2>
              </div>
              <Link href="/catalog">
                {t.seeAll} ({categories.length}) <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="aisle-group">
              <div className="aisles">
                {categories.map((category, place) => (
                  <AisleTile key={category.slug} category={category} locale={locale} eager={place < 8} fallback={photos.get(category.slug)} />
                ))}
                <Link href="/catalog" className="aisle-tile quiet">
                  <span className="aisle-art">
                    <AisleIcon slug="all" />
                  </span>
                  <span className="aisle-label">
                    <strong>{t.allAisles(categories.length)}</strong>
                  </span>
                </Link>
              </div>
            </div>
          </section>
        )}
        {buyAgainRow.length > 0 && (
          <Section
            id="again-title"
            title={t.usualsTitle}
            subtitle={t.usuals}
            link="/account/orders"
            linkLabel={t.pastOrders}
          >
            <div className="product-grid">
              {/* lazy: the first rail starts at the bottom of a phone's first screen (below it on a
                  computer), and an eager card's photo was preloaded ahead of the page's own styles */}
              {buyAgainRow.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        {popular.length > 0 && (
          <Section
            id="popular-title"
            title={t.popular}
            link="/catalog"
            linkLabel={t.seeAll}
            count={products.length}
          >
            <div className="product-grid">
              {popular.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        {activeOffers.length > 0 && (
          <section className="offer-ladder" aria-label={t.offers}>
            <span className="eyebrow">{t.offers}</span>
            <ul>
              {activeOffers.map(
                (offer) => (
                  <li key={String(offer._id)}>
                    <strong>{describe(offer)}</strong>
                    {offer.code ? (
                      <span className="offer-code">{offer.code}</span>
                    ) : (
                      <span className="muted">{t.automatic}</span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
        <div className="benefits" role="region" aria-label={t.benefitsLabel}>
        <div>
          <span className="benefit-icon">
            <Truck aria-hidden="true" />
          </span>
          <strong>{t.freeFrom(freeFrom)}</strong>
          {areas && <small>{areas}</small>}
        </div>
        <div>
          <span className="benefit-icon">
            <Wallet aria-hidden="true" />
          </span>
          <strong>{t.payment(online)}</strong>
          <small>{t.step3Note(online)}</small>
        </div>
        <div>
          <span className="benefit-icon">
            <Clock3 aria-hidden="true" />
          </span>
          <strong>{t.step1(cutoff)}</strong>
          <small>{t.step1Note}</small>
        </div>
        </div>
        <section className="delivery-steps" id="delivery" aria-labelledby="story-title">
          <div>
            <span className="eyebrow">{t.storyEyebrow}</span>
            <h2 id="story-title">{frontWords(front, "storyTitle", locale)}</h2>
            <p>{frontWords(front, "storyBody", locale)}</p>
          </div>
          <ol>
            <li>
              <Clock3 size={22} aria-hidden="true" />
              <strong>{t.step1(cutoff)}</strong>
              <small>{t.step1Note}</small>
            </li>
            <li>
              <Store size={22} aria-hidden="true" />
              <strong>{t.step2}</strong>
              <small>{t.step2Note}</small>
            </li>
            <li>
              <Truck size={22} aria-hidden="true" />
              <strong>{t.step3}</strong>
              <small>{t.step3Note(online)}</small>
            </li>
          </ol>
          <form className="pin-check" action="/serviceability">
            <label htmlFor="welcome-pin">{t.pinLabel}</label>
            <div>
              <input
                id="welcome-pin"
                name="pin"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="postal-code"
                aria-describedby="welcome-pin-hint"
                placeholder="402106"
                required
              />
              <button className="primary-button">{t.checkPin}</button>
            </div>
            <small className="muted" id="welcome-pin-hint">
              {t.pinHint}
            </small>
          </form>
        </section>
        {newRow.length > 0 && (
          <Section
            id="new-title"
            title={t.newIn}
            link="/catalog?sort=new"
            linkLabel={t.seeAll}
          >
            <div className="product-grid">
              {newRow.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        <section className="section home-faq" aria-labelledby="faq-title">
          <div className="section-heading">
            <div>
              <h2 id="faq-title">{t.faq}</h2>
            </div>
          </div>
          <div className="faq-list">
            {faq.map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>
                  <LegalText text={item.a} mr={locale === "mr"} />
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
