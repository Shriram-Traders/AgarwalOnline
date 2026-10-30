import type { CatalogItem } from "./catalog/queries";
import type { TaxProfile } from "./tax/gst";
import { formatPrice } from "./display";

const STORE = "Agarwal Online";

/** schema.org data as a script body; `<` escaped so a product name can never close the script tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** A product and its breadcrumb, as Google reads them for rich results. Uploaded photos are site-relative. */
export function productJsonLd(p: CatalogItem, origin: string, categoryName: string, photos: string[]) {
  const url = `${origin}/products/${p.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name.en,
      description: p.description.en,
      url,
      category: categoryName,
      ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
      ...(photos.length ? { image: photos.map((src) => new URL(src, origin).href) } : {}),
      // verified-purchase reviews only; nothing is shown until there is one
      ...(p.reviewCount
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviewCount } }
        : {}),
      offers: p.variants.map((v) => ({
        "@type": "Offer",
        name: v.label,
        ...(v.sku ? { sku: v.sku } : {}),
        url,
        priceCurrency: "INR",
        price: (v.pricePaise / 100).toFixed(2),
        availability: `https://schema.org/${v.available > 0 ? "InStock" : "OutOfStock"}`,
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: STORE },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "All products", item: `${origin}/catalog` },
        { name: categoryName, item: `${origin}/catalog?category=${p.categorySlug}` },
        { name: p.name.en, item: url },
      ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
    },
  ] as const;
}

/** The shop itself, from the details the owner saved. No hours or map pin: the site doesn't store them. */
export function storeJsonLd(
  profile: Pick<TaxProfile, "legalName" | "address" | "phone" | "email">,
  areas: string[],
  origin: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: profile.legalName,
    // the shop's name on Google Maps and the spellings people type (JustDial has "Agrawal"), so Google
    // ties the website to the Maps listing; the same spellings are written on the home page
    alternateName: [
      "Agarwal General Store",
      "Agarwal General Stores",
      "Agarwal Store",
      "Agarwal Stores",
      "Agrawal General Store",
      "Aggarwal General Store",
    ],
    url: origin,
    logo: `${origin}/icons/icon-512.png`,
    image: `${origin}/icons/icon-512.png`,
    ...(profile.phone ? { telephone: `+91${profile.phone}` } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: profile.address,
      addressLocality: "Nagothane",
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    },
    areaServed: areas.map((name) => ({ "@type": "Place", name })),
  };
}

/** Cut to fit Google's snippet (about 160 characters) at a word, with "…" when anything was cut. */
export function clip(text: string, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const word = cut.lastIndexOf(" ");
  return `${(word > max * 0.6 ? cut.slice(0, word) : cut).replace(/[\s,;:·–-]+$/, "")}…`;
}

/** A snippet that always ends with the local promise: the text gives way, never the delivery line. */
export const snippet = (text: string, tail = " Same-day home delivery in Nagothane.") => clip(text, 160 - tail.length) + tail;

const listed = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Product page snippet: what it is and costs first, the description next, local delivery always last. */
export function productDescription(p: Pick<CatalogItem, "name" | "description" | "variants">) {
  const v = p.variants[0];
  return snippet(`${p.name.en} (${v.label}), ${formatPrice(v.pricePaise)}. ${p.description.en}`);
}

/** An aisle in one line, from its products: the brands it stocks most (up to four) and its price range. */
export function aisleSummary(products: Pick<CatalogItem, "brand" | "variants">[]) {
  const counts = new Map<string, number>();
  for (const p of products) if (p.brand) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  const brands = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([brand]) => brand);
  const prices = products.flatMap((p) => p.variants.map((v) => v.pricePaise));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = prices.length ? (low === high ? formatPrice(low) : `${formatPrice(low)}–${formatPrice(high)}`) : "";
  return { count: products.length, brands, range };
}

/** The aisle's search snippet: its name, how many products, whose, at what prices, and same-day delivery. */
export function aisleDescription(name: string, products: Pick<CatalogItem, "brand" | "variants">[]) {
  const { count, brands, range } = aisleSummary(products);
  const from = brands.length ? `from ${listed(brands.length > 4 ? [...brands.slice(0, 4), "more"] : brands)}` : "";
  const what = [`${count} ${count === 1 ? "product" : "products"}`, from].filter(Boolean).join(" ");
  return snippet(`${name} at ${STORE}: ${what}${range ? `, ${range}` : ""}.`);
}

/** The site's own name, which Google shows above each result instead of guessing one from the domain. Home page only. */
export const websiteJsonLd = (origin: string) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: STORE,
  alternateName: "agarwalonline.in",
  url: `${origin}/`,
});
