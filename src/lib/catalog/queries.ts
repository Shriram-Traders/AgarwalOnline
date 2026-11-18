import { cache } from "react";
import { connectDB } from "../db/connect";
import {
  Product,
  ProductVariant,
  InventoryItem,
  SearchSynonym,
  Category,
  parentsOf,
} from "../db/models";
import { normalizeSearch } from "./search";
import { log } from "../logger";
import { z } from "zod";
import type { PipelineStage } from "mongoose";
import { ProductReview } from "../reviews/models";
import { schoolVisible, shopperVisible } from "./visibility";
import { shared } from "../db/shop-cache";
import { SHOP_PLAN } from "./sections";
import { Provider, type ProviderLabel } from "../providers/models";
export type CatalogItem = {
  id: string;
  slug: string;
  name: { en: string; mr: string };
  description: { en: string; mr: string };
  brand: string;
  image?: string;
  images: string[];
  highlights: { en: string; mr: string }[];
  dietaryTags: string[];
  specifications: {
    label: { en: string; mr: string };
    value: { en: string; mr: string };
  }[];
  featured: boolean;
  bestseller: boolean;
  categorySlug: string;
  /** Other shelves it also shows on; `categorySlug` is its own. */
  alsoOn: string[];
  /** Another shop that supplies it, once an owner approved it: "Provided by …". None for our own stock. */
  provider?: ProviderLabel;
  /** School catalogue only. */
  gstRatePercent?: number;
  variants: {
    id: string;
    /** The shop's stock code; search engines read it from the product page. */
    sku?: string;
    label: string;
    pricePaise: number;
    mrpPaise: number;
    available: number;
    maxQuantity: number;
    /** School catalogue only: the expected price before GST. */
    schoolPricePaise?: number;
  }[];
  rating: number;
  reviewCount: number;
};
// values come straight from the page address: a repeated key (an array), a word too long or a rating
// that isn't one falls back instead of failing the page
const filtersSchema = z.object({
  q: z.string().catch("").transform((text) => text.slice(0, 100)),
  category: z.string().max(60).catch(""),
  sort: z
    .enum(["featured", "price-asc", "price-desc", "discount", "new"])
    .catch("featured"),
  inStock: z.string().optional().catch(undefined),
  rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  // a web address no product can have finds nothing (never "any product")
  slug: z.string().max(100).optional().catch("-"),
});
/** The shop catalogue: what shoppers see. Its filters come straight from the page address. */
export async function catalog(
  input: Record<string, string | undefined> = {},
): Promise<CatalogItem[]> {
  return catalogFor("customers", input);
}
/**
 * The school catalogue: products ticked for schools, with their school prices. Only a search
 * and an aisle come from the caller; the audience is never read from the address, or
 * `/catalog?…` could show school prices to anyone.
 */
export async function catalogForSchools(input: { q?: string; category?: string } = {}) {
  return catalogFor("schools", { q: input.q, category: input.category });
}
import { aisleRank, browseCatalog, type BrowseFields } from "./browse";
/** Far more than the shop lists today. */
const SHELF_LIMIT = 2000;

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Shelf = {
  /** Visible to the audience, bestsellers first, then oldest first: the "featured" order. */
  products: Doc[];
  byId: Map<string, Doc>;
  /** Packs on sale, by product and by their own id. */
  variants: Map<string, Doc[]>;
  variantById: Map<string, Doc>;
  available: Map<string, number>;
  reviews: Map<string, { rating: number; reviewCount: number }>;
  /** Approved providers' names and towns, by id. */
  providers: Map<string, ProviderLabel>;
};

/**
 * Everything a product list needs, shared by every list on the page: the home page asks for
 * three lists and the product page two. Products, packs and review scores come from the shop
 * cache (src/lib/db/shop-cache.ts), which any edit to them empties. Stock changes with every
 * order, so it is kept for five seconds only: a page is about that old by the time it is read
 * anyway, and checkout counts the stock itself before taking an order.
 */
const shelfFor = cache(async (audience: "customers" | "schools"): Promise<Shelf> => {
  await connectDB();
  const [{ products, variants, reviews, providers }, inventory] = await Promise.all([
    shared(`shelf:${audience}`, async () => {
      const [products, variants, reviews, providers] = await Promise.all([
        Product.find(audience === "schools" ? schoolVisible : shopperVisible)
          .sort({ bestseller: -1, createdAt: 1 })
          .limit(SHELF_LIMIT)
          .lean<Doc[]>(),
        // a hidden pack isn't offered; older packs have no flag and stay on
        ProductVariant.find({ active: { $ne: false } }).lean<Doc[]>(),
        ProductReview.aggregate<{ _id: unknown; rating: number; reviewCount: number }>([
          { $match: { status: "published" } },
          { $group: { _id: "$productId", rating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
        ]),
        // only approved ones: a provider still waiting for an owner isn't named to shoppers
        Provider.find({ status: "active" }).select("name town").lean<Doc[]>(),
      ]);
      return { products, variants, reviews, providers };
    }),
    shared("stock", () => InventoryItem.find({}).select("variantId onHand reserved").lean<Doc[]>(), 5),
  ]);
  const byProduct = new Map<string, Doc[]>();
  for (const variant of variants) {
    const key = String(variant.productId);
    byProduct.set(key, [...(byProduct.get(key) ?? []), variant]);
  }
  return {
    products,
    byId: new Map(products.map((product) => [String(product._id), product])),
    variants: byProduct,
    variantById: new Map(variants.map((variant) => [String(variant._id), variant])),
    available: new Map(
      inventory.map((item) => [String(item.variantId), Math.max(0, (item.onHand ?? 0) - (item.reserved ?? 0))]),
    ),
    reviews: new Map(
      reviews.map((row: { _id: unknown; rating: number; reviewCount: number }) => [
        String(row._id),
        { rating: row.rating, reviewCount: row.reviewCount },
      ]),
    ),
    providers: new Map(providers.map((provider) => [String(provider._id), { name: provider.name, town: provider.town }])),
  };
});

/** What shoppers can buy now, with packs and stock: the basket reads its lines from here too. */
export const shopShelf = () => shelfFor("customers");

/** A photo for each shelf: its most popular product's own. For the shelf rail and the home tiles. */
export const shelfPhotos = cache(async () => {
  const photos = new Map<string, string>();
  for (const product of (await shelfFor("customers")).products)
    if (product.image && !photos.has(product.categorySlug)) photos.set(product.categorySlug, product.image);
  return photos;
});

/** The owner's synonym groups ("copy" = "notebook"), from the shop cache. */
const searchSynonyms = () =>
  shared("synonyms", async () =>
    (await SearchSynonym.find({}).select("synonyms").limit(1000).lean<{ synonyms: string[] }[]>()).map(
      (group) => group.synonyms,
    ),
  );

/**
 * Ids of the products Atlas Search finds, best first, when it is switched on (ATLAS_SEARCH_ENABLED);
 * null when it is off, fails or finds nothing, and the built-in search (browse.ts) answers instead.
 */
async function atlasMatches(query: string, match: Record<string, unknown>): Promise<string[] | null> {
  if (!query || process.env.ATLAS_SEARCH_ENABLED !== "true") return null;
  const pipeline: PipelineStage[] = [
    {
      $search: {
        index: "products",
        text: {
          query,
          path: ["name.en", "name.mr", "brand", "aliases"],
          synonyms: "grocery-synonyms",
          matchCriteria: "any",
        },
      },
    },
    { $match: match },
    { $limit: 100 },
  ];
  // a missing or broken index must not take search down: fall through to the built-in search
  const products = await Product.aggregate<{ _id: unknown }>(pipeline).catch((error: unknown) => {
    log("warn", "catalog.atlas_search_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  return products?.length ? products.map((product) => String(product._id)) : null;
}

/** A catalogue product with what browsing reads besides: its aliases and when it was added. */
export type BrowseItem = CatalogItem & Pick<BrowseFields, "aliases" | "createdAt">;

/** Every product on the shelf as the shop lists them, in the shelf's own order. */
function shelfItems(shelf: Shelf, forSchools: boolean): BrowseItem[] {
  return shelf.products.map((p) => {
    const reviews = shelf.reviews.get(String(p._id));
    return {
      id: String(p._id),
      slug: p.slug,
      name: { en: p.name.en, mr: p.name.mr },
      description: { en: p.description.en, mr: p.description.mr },
      brand: p.brand ?? "",
      image: p.image,
      images: p.images ?? [],
      highlights: p.highlights ?? [],
      dietaryTags: p.dietaryTags ?? [],
      specifications: p.specifications ?? [],
      featured: Boolean(p.featured),
      bestseller: Boolean(p.bestseller),
      categorySlug: p.categorySlug,
      alsoOn: p.alsoOn ?? [],
      aliases: p.aliases ?? [],
      createdAt: new Date(p.createdAt ?? 0).getTime(),
      ...(p.providerId && shelf.providers.has(String(p.providerId)) ? { provider: shelf.providers.get(String(p.providerId)) } : {}),
      ...(forSchools && p.gstRatePercent != null ? { gstRatePercent: p.gstRatePercent } : {}),
      rating: reviews?.rating ?? 0,
      reviewCount: reviews?.reviewCount ?? 0,
      variants: (shelf.variants.get(String(p._id)) ?? []).map((v) => ({
        id: String(v._id),
        sku: v.sku,
        label: v.label,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise,
        maxQuantity: v.maxQuantity ?? 10,
        ...(forSchools && v.schoolPricePaise != null ? { schoolPricePaise: v.schoolPricePaise } : {}),
        available: shelf.available.get(String(v._id)) ?? 0,
      })),
    };
  });
}

/** The whole shop for a shopper's phone to browse: every product, the shelves' names and the owner's synonyms. */
export async function shopCatalogue() {
  const shelf = await shelfFor("customers");
  const [synonyms, aisles] = await Promise.all([searchSynonyms(), catalogCategories()]);
  return { items: shelfItems(shelf, false).filter((item) => item.variants.length > 0), aisles: aisles.map(({ slug, en, mr }) => ({ slug, en, mr })), synonyms };
}

async function catalogFor(
  audience: "customers" | "schools",
  input: Record<string, string | undefined>,
): Promise<CatalogItem[]> {
  const filters = filtersSchema.parse(input);
  const forSchools = audience === "schools";
  const match: Record<string, unknown> = {
    ...(forSchools ? schoolVisible : shopperVisible),
    ...(filters.slug ? { slug: filters.slug } : {}),
    ...(filters.category ? { $or: [{ categorySlug: filters.category }, { alsoOn: filters.category }] } : {}),
  };
  const query = normalizeSearch(filters.q);
  const shelf = await shelfFor(audience);
  const [matched, synonyms, aisles] = await Promise.all([
    atlasMatches(query, match),
    query ? searchSynonyms() : Promise.resolve([] as string[][]),
    query ? catalogCategories() : Promise.resolve([]),
  ]);
  // the same browsing a shopper's phone does on the whole catalogue (browse.ts)
  return browseCatalog(shelfItems(shelf, forSchools), filters, { aisles, synonyms, forSchools, matched });
}
/** Memoised per request: the page and its metadata both ask. */
export const productBySlug = cache(async (slug: string) => {
  const all = await catalog({ slug });
  return all[0] ?? null;
});
/** A product in the school catalogue, with its school prices; null for anything not ticked for schools. */
export const schoolProductBySlug = cache(async (slug: string) => {
  const all = await catalogFor("schools", { slug });
  return all[0] ?? null;
});

const allCategories = () => shared("categories", readCategories);
/**
 * The shelves products sit on, in the shop's order; from the shop cache, since every page's menu and
 * footer list them. Sections are left out: a section only groups shelves and has no page of its own.
 */
export const catalogCategories = async () => {
  const all = await allCategories();
  const sections = new Set(all.flatMap((category) => category.parentIds));
  return all.filter((category) => !sections.has(category.id));
};
/**
 * The sections with the shelves under each, both in the shop's order; a shelf can be under several.
 * Shelves in no section come last under "More". Empty until some shelf is put in a section: the
 * shop is then one list of shelves, as it was.
 */
export const catalogSections = async () => {
  const all = await allCategories();
  const sectionIds = new Set(all.flatMap((category) => category.parentIds));
  if (!sectionIds.size) return [];
  const shelves = all.filter((category) => !sectionIds.has(category.id));
  const loose = shelves.filter((shelf) => !shelf.parentIds.length);
  return [
    ...all
      .filter((category) => sectionIds.has(category.id))
      .map((section) => {
        // a planned category opens on the subcategory it's about (Gifts on Party & Gifting, not Diaries);
        // ones added by hand follow, in the shop's aisle order
        const plan: readonly string[] = SHOP_PLAN.find((planned) => planned.slug === section.slug)?.shelves ?? [];
        const rank = (slug: string) => plan.indexOf(slug) + 1 || plan.length + 1;
        return {
          ...section,
          shelves: shelves.filter((shelf) => shelf.parentIds.includes(section.id)).sort((a, b) => rank(a.slug) - rank(b.slug)),
        };
      }),
    ...(loose.length ? [{ id: "", slug: "", en: "More", mr: "आणखी", symbol: "", parentIds: [] as string[], shelves: loose }] : []),
  ];
};

/**
 * Whether anything sells below its MRP, for the header's Offers and the footer's Deals links. Answered
 * from the shelf the page already holds; the layout used to build the whole catalogue on every page for it.
 */
export const anyOnOffer = cache(async () => {
  const shelf = await shelfFor("customers");
  return shelf.products.some((p) =>
    (shelf.variants.get(String(p._id)) ?? []).some((v) => v.pricePaise < v.mrpPaise),
  );
});
async function readCategories() {
  await connectDB();
  const rows = await Category.find({}).limit(200);
  return rows.map((row) => ({
    id: String(row._id),
    slug: row.slug,
    en: row.name.en,
    mr: row.name.mr,
    symbol: row.symbol ?? "",
    parentIds: parentsOf(row),
  })).sort((a, b) => aisleRank(a.slug) - aisleRank(b.slug) || a.en.localeCompare(b.en));
}
