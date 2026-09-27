import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Clock3,
  Compass,
  Flame,
  Heart,
  LayoutGrid,
  RotateCcw,
  Sparkles,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AisleIcon } from "@/components/aisle-icon";
import { deliveryRules } from "@/lib/commerce/service";
import { categoryImages, heroImage, productImages } from "@/lib/catalog/images";
import { catalog, catalogCategories } from "@/lib/catalog/queries";
import { ProductCard } from "@/components/product-card";
import { DeliveryPromise } from "@/components/delivery-promise";
import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { Order } from "@/lib/commerce/models";
import { connectDB } from "@/lib/db/connect";
import { ServiceArea } from "@/lib/db/models";
import { recommendationsFor } from "@/lib/catalog/recommendations";
import { Promotion } from "@/lib/promotions/models";
import { discountPercent, formatPrice, minutesUntilCutoff } from "@/lib/display";
export const dynamic = "force-dynamic";

const copy = {
  en: {
    heroBadge: "Same-day delivery · Nagothane",
    heroTitle: (cutoff: string) => `Order by ${cutoff}, `,
    heroTitleEm: "at your door today.",
    shopAll: "Shop all products",
    dealEyebrow: "Biggest saving today",
    dealCta: "See the deal",
    hubs: "Explore the aisles",
    hubsMr: "विभाग पाहा",
    productsCount: (n: number) => (n === 1 ? "1 product" : `${n} products`),
    lead: "Stationery, school supplies, gifts and party essentials at fair prices, carried to your door by the same people who serve you in store.",
    pinLabel: "Check delivery at your PIN code",
    pinHint: "Six digits. Used only to check serviceability.",
    checkPin: "Check",
    freeFrom: (amount: string) => `Free delivery from ${amount}`,
    payment: "Cash on delivery or pay online",
    areasLabel: (areas: string) => `Delivering in ${areas}`,
    benefitsLabel: "Delivery and payment facts",
    offers: "Offers running now",
    offersMr: "सध्याच्या ऑफर",
    allOffers: "Shop the offers",
    withCode: "Use code",
    automatic: "Applied automatically at checkout",
    everyBasket: "on every basket",
    minimum: (amount: string) => `on baskets of ${amount} or more`,
    percentOff: (value: number) => `${value}% off`,
    amountOff: (amount: string) => `${amount} off`,
    aisles: "Shop by aisle",
    aislesMr: "विभागानुसार खरेदी",
    allAisles: (n: number) => `All ${n} aisles`,
    usuals: "Your usuals",
    usualsTitle: "Buy it again.",
    pastOrders: "Past orders",
    popular: "Popular in the shop",
    popularMr: "दुकानातील लोकप्रिय",
    seeAll: "See all",
    savings: "Biggest savings",
    savingsMr: "सर्वाधिक बचत",
    newIn: "New in store",
    newInMr: "दुकानात नवीन",
    picked: "Picked for you",
    pickedMr: "तुमच्यासाठी निवडलेले",
    storyEyebrow: "How delivery works",
    step1: (cutoff: string) => `Order before ${cutoff}`,
    step1Note: "Anything ordered after that goes out tomorrow.",
    step2: "Packed at the counter",
    step2Note: "By the same people who serve you in store.",
    step3: "At your door the same day",
    step3Note: "Pay in cash when it arrives, or online.",
    storyTitle: "A counter you already know.",
    storyBody:
      "Agarwal General Stores has served Nagothane from one counter for years. The website is the same shelves and the same prices, with delivery added. Order in English or Marathi, pay in cash at the door if you prefer.",
    storyArea: "Check your area",
    storyTalk: "Talk to the store",
  },
  mr: {
    heroBadge: "त्याच दिवशी वितरण · नागोठणे",
    heroTitle: (cutoff: string) => `${cutoff} पूर्वी ऑर्डर करा, `,
    heroTitleEm: "आज दारात.",
    shopAll: "सर्व उत्पादने पाहा",
    dealEyebrow: "आजची सर्वात मोठी बचत",
    dealCta: "ऑफर पाहा",
    hubs: "विभाग पाहा",
    hubsMr: "Explore the aisles",
    productsCount: (n: number) => `${n} उत्पादने`,
    lead: "लेखन साहित्य, शालेय वस्तू, भेटवस्तू आणि पार्टी साहित्य योग्य किमतीत, दुकानातील तीच माणसे तुमच्या दारापर्यंत पोहोचवतात.",
    pinLabel: "तुमच्या पिन कोडवर वितरण तपासा",
    pinHint: "सहा अंक. फक्त वितरण उपलब्धता तपासण्यासाठी.",
    checkPin: "तपासा",
    freeFrom: (amount: string) => `${amount} पासून मोफत वितरण`,
    payment: "रोख किंवा ऑनलाइन पेमेंट",
    areasLabel: (areas: string) => `${areas} येथे वितरण`,
    benefitsLabel: "वितरण आणि पेमेंट माहिती",
    offers: "सध्याच्या ऑफर",
    offersMr: "Offers running now",
    allOffers: "ऑफर पाहा",
    withCode: "कोड वापरा",
    automatic: "चेकआउटला आपोआप लागू",
    everyBasket: "प्रत्येक बास्केटवर",
    minimum: (amount: string) => `${amount} किंवा अधिकच्या बास्केटवर`,
    percentOff: (value: number) => `${value}% सूट`,
    amountOff: (amount: string) => `${amount} सूट`,
    aisles: "विभागानुसार खरेदी",
    aislesMr: "Shop by aisle",
    allAisles: (n: number) => `सर्व ${n} विभाग`,
    usuals: "तुमच्या नेहमीच्या वस्तू",
    usualsTitle: "पुन्हा खरेदी करा.",
    pastOrders: "मागील ऑर्डर",
    popular: "दुकानातील लोकप्रिय",
    popularMr: "Popular in the shop",
    seeAll: "सर्व पाहा",
    savings: "सर्वाधिक बचत",
    savingsMr: "Biggest savings",
    newIn: "दुकानात नवीन",
    newInMr: "New in store",
    picked: "तुमच्यासाठी निवडलेले",
    pickedMr: "Picked for you",
    storyEyebrow: "वितरण कसे चालते",
    step1: (cutoff: string) => `${cutoff} पूर्वी ऑर्डर करा`,
    step1Note: "त्यानंतरच्या ऑर्डर उद्या पाठवल्या जातात.",
    step2: "काउंटरवर पॅक",
    step2Note: "दुकानात तुम्हाला भेटणारी तीच माणसे.",
    step3: "त्याच दिवशी तुमच्या दारी",
    step3Note: "आल्यावर रोख द्या, किंवा ऑनलाइन.",
    storyTitle: "तुमच्या ओळखीचाच काउंटर.",
    storyBody:
      "अग्रवाल जनरल स्टोअर्स वर्षानुवर्षे नागोठण्याला एकाच काउंटरवरून सेवा देत आहे. वेबसाइटवर त्याच वस्तू आणि त्याच किमती, फक्त वितरणाची सोय जोडली आहे. इंग्रजी किंवा मराठीत ऑर्डर करा, हवे असल्यास दारात रोख द्या.",
    storyArea: "तुमचे क्षेत्र तपासा",
    storyTalk: "दुकानाशी बोला",
  },
} as const;

/** Uniform aisle tile: square art above, bilingual label below. */
function AisleTile({
  category,
  locale,
  eager = false,
}: {
  category: { slug: string; en: string; mr: string };
  locale: "en" | "mr";
  eager?: boolean;
}) {
  const photo = categoryImages[category.slug];
  const other = locale === "en" ? "mr" : "en";
  return (
    <Link
      href={`/catalog?category=${category.slug}`}
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
            unoptimized
          />
        ) : (
          <AisleIcon slug={category.slug} />
        )}
      </span>
      <span className="aisle-label">
        <strong lang={locale}>{category[locale]}</strong>
        <small lang={other}>{category[other]}</small>
      </span>
    </Link>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  link,
  linkLabel,
  count,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  link: string;
  linkLabel: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <h2 id={id}>
            <span className="section-icon">
              <Icon aria-hidden="true" />
            </span>
            {title}
          </h2>
          <span className="muted">{subtitle}</span>
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
  const [products, newest, user, categories, locale, rules] = await Promise.all([
    catalog(),
    catalog({ sort: "new" }),
    currentUser(),
    catalogCategories(),
    currentLocale(),
    deliveryRules(),
  ]);
  const [recommended, activeOffers, areaDocs] = await Promise.all([
    recommendationsFor({
      customerId: user?.id,
      limit: 8,
    }),
    Promotion.find({ active: true, startsAt: { $lte: now }, endsAt: { $gte: now } })
      .sort({ minimumSubtotalPaise: 1 })
      .limit(2)
      .select("name code kind discountType discountValue minimumSubtotalPaise"),
    connectDB().then(() => ServiceArea.find({}).select("name")),
  ]);
  const previousOrder =
    user
      ? await Order.findOne({ customerId: user.id })
          .sort({ createdAt: -1 })
          .select("items.variantId")
      : null;
  const previousIds = new Set(
    previousOrder?.items.map((item: { variantId: unknown }) =>
      String(item.variantId),
    ) ?? [],
  );
  const buyAgain = products.filter((product) =>
    product.variants.some((variant) => previousIds.has(variant.id)),
  );
  const t = copy[locale];
  const cutoff = `${rules.cutoffHour % 12 || 12} ${rules.cutoffHour >= 12 ? "PM" : "AM"}`;
  const freeFrom = formatPrice(rules.freeThresholdPaise);
  const areas = areaDocs.map((area: { name: string }) => area.name).join(" · ");
  const bestsellers = products.filter((product) => product.bestseller);
  const savings = products
    .map((product) => ({
      product,
      off: Math.max(
        ...product.variants.map((variant) =>
          discountPercent(variant.pricePaise, variant.mrpPaise),
        ),
      ),
    }))
    .filter((row) => row.off > 0)
    .sort((a, b) => b.off - a.off)
    .map((row) => row.product);
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
  // the deal card needs a photograph; the rails skip whatever it features
  const deal = savings.find((product) => product.image ?? productImages[product.slug]);
  if (deal) shown.add(deal.id);
  const dealVariant = deal?.variants[0];
  const dealOff = dealVariant ? discountPercent(dealVariant.pricePaise, dealVariant.mrpPaise) : 0;
  const other = locale === "en" ? "mr" : "en";
  const hubs = categories
    .map((category) => ({
      category,
      items: products.filter((product) => product.categorySlug === category.slug),
    }))
    .filter((hub) => hub.items.length > 0)
    .slice(0, 4);
  const buyAgainRow = take(buyAgain, 5);
  const popular = take(bestsellers.length ? bestsellers : products, 10);
  const savingsRow = take(savings, 5);
  const newRow = take(newest, 5);
  const pickedRow = take(recommended, 5);
  /** Accurate offer terms, built from the promotion record rather than written copy. */
  const describe = (offer: {
    discountType: string;
    discountValue: number;
    minimumSubtotalPaise: number;
  }) => {
    const amount =
      offer.discountType === "percentage"
        ? t.percentOff(offer.discountValue)
        : t.amountOff(formatPrice(offer.discountValue));
    const condition = offer.minimumSubtotalPaise
      ? t.minimum(formatPrice(offer.minimumSubtotalPaise))
      : t.everyBasket;
    return `${amount} ${condition}`;
  };
  return (
    <>
      <section className="hero" aria-labelledby="welcome-title">
        <div className="hero-card">
          <Image src={heroImage} alt="" fill sizes="60vw" priority unoptimized />
          <span className="hero-badge">{t.heroBadge}</span>
          <h1 id="welcome-title">
            {t.heroTitle(cutoff)}
            <em>{t.heroTitleEm}</em>
          </h1>
          <p>{t.lead}</p>
          <div className="hero-actions">
            <Link href="/catalog" className="primary-button">
              {t.shopAll}
            </Link>
            <Link href="#delivery" className="secondary-button">
              {t.storyArea}
            </Link>
            <DeliveryPromise
              cutoffHour={rules.cutoffHour}
              initialMinutes={minutesUntilCutoff(rules.cutoffHour, now)}
              locale={locale}
            />
          </div>
        </div>
        {deal && dealVariant && (
          <aside className="deal-card" aria-labelledby="deal-title">
            <span className="eyebrow">{t.dealEyebrow}</span>
            <h2 id="deal-title" lang={locale}>
              {deal.name[locale]}
            </h2>
            <p lang={other}>
              {deal.name[other]} · {dealVariant.label}
            </p>
            <Link href={`/products/${deal.slug}?lang=${locale}`} className="deal-art">
              <Image
                src={deal.image ?? productImages[deal.slug]}
                alt={`Representative ${deal.name.en.toLowerCase()} photography`}
                fill
                sizes="(max-width: 1023px) 90vw, 400px"
                priority
                unoptimized
              />
            </Link>
            <p className="deal-price">
              <strong>{formatPrice(dealVariant.pricePaise)}</strong>
              <del>{formatPrice(dealVariant.mrpPaise)}</del>
              <span className="deal-off">−{dealOff}%</span>
              <Link href={`/products/${deal.slug}?lang=${locale}`}>
                {t.dealCta} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </p>
          </aside>
        )}
      </section>
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
          <strong>{t.payment}</strong>
          <small>{t.step3Note}</small>
        </div>
        <div>
          <span className="benefit-icon">
            <Clock3 aria-hidden="true" />
          </span>
          <strong>{t.step1(cutoff)}</strong>
          <small>{t.step2Note}</small>
        </div>
      </div>
      <div className="page-container home">
        {buyAgainRow.length > 0 && (
          <Section
            id="again-title"
            icon={RotateCcw}
            title={t.usualsTitle}
            subtitle={t.usuals}
            link="/account/orders"
            linkLabel={t.pastOrders}
          >
            <div className="product-grid">
              {buyAgainRow.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  eager={index < 5}
                />
              ))}
            </div>
          </Section>
        )}
        <Section
          id="aisles-title"
          icon={LayoutGrid}
          title={t.aisles}
          subtitle={t.aislesMr}
          link="/catalog"
          linkLabel={t.seeAll}
          count={categories.length}
        >
          <div className="aisles">
            {categories.map((category, index) => (
              <AisleTile
                key={category.slug}
                category={category}
                locale={locale}
                eager={index < 6}
              />
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
        </Section>
        {popular.length > 0 && (
          <Section
            id="popular-title"
            icon={Flame}
            title={t.popular}
            subtitle={t.popularMr}
            link="/catalog"
            linkLabel={t.seeAll}
            count={products.length}
          >
            <div className="product-grid">
              {popular.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  eager={!buyAgainRow.length && index < 5}
                />
              ))}
            </div>
          </Section>
        )}
        {activeOffers.length > 0 && (
          <section className="offer-ladder" aria-label={t.offers}>
            <span className="eyebrow">{t.offers}</span>
            <ul>
              {activeOffers.map(
                (offer: {
                  _id: unknown;
                  name: string;
                  code?: string;
                  discountType: string;
                  discountValue: number;
                  minimumSubtotalPaise: number;
                }) => (
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
        {savingsRow.length > 0 && (
          <Section
            id="savings-title"
            icon={BadgePercent}
            title={t.savings}
            subtitle={t.savingsMr}
            link="/catalog?sort=discount"
            linkLabel={t.seeAll}
            count={savings.length}
          >
            <div className="product-grid">
              {savingsRow.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        <section className="delivery-steps" id="delivery" aria-labelledby="story-title">
          <div>
            <span className="eyebrow">{t.storyEyebrow}</span>
            <h2 id="story-title">{t.storyTitle}</h2>
            <p>{t.storyBody}</p>
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
              <small>{t.step3Note}</small>
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
            icon={Sparkles}
            title={t.newIn}
            subtitle={t.newInMr}
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
        {user && pickedRow.length > 0 && (
          <Section
            id="picked-title"
            icon={Heart}
            title={t.picked}
            subtitle={t.pickedMr}
            link="/catalog"
            linkLabel={t.seeAll}
          >
            <div className="product-grid">
              {pickedRow.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        {hubs.length > 0 && (
          <section className="section" aria-labelledby="hubs-title">
            <div className="section-heading">
              <div>
                <h2 id="hubs-title">
                  <span className="section-icon">
                    <Compass aria-hidden="true" />
                  </span>
                  {t.hubs}
                </h2>
                <span className="muted">{t.hubsMr}</span>
              </div>
            </div>
            <div className="hubs">
              {hubs.map(({ category, items }) => (
                <Link
                  key={category.slug}
                  href={`/catalog?category=${category.slug}`}
                  className="hub-card"
                >
                  <span className="hub-eyebrow" lang={other}>
                    {category[other]}
                  </span>
                  <strong lang={locale}>{category[locale]}</strong>
                  <p lang={locale}>
                    {items.slice(0, 3).map((product) => product.name[locale]).join(" · ")}
                  </p>
                  <span className="hub-count">
                    {t.productsCount(items.length)}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
