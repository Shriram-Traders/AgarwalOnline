import { cache } from "react";
import { connectDB } from "../db/connect";
import {
  Product,
  ProductVariant,
  InventoryItem,
  SearchSynonym,
  Category,
} from "../db/models";
import {
  normalizeSearch,
  defaultSynonyms,
  fuzzyPattern,
  patternRelevance,
  relevance,
  searchWords,
  wordPattern,
} from "./search";
import { log } from "../logger";
import { z } from "zod";
import type { PipelineStage, SortOrder } from "mongoose";
import { ProductReview } from "../reviews/models";
import { schoolVisible, shopperVisible } from "./visibility";
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
  /** School catalogue only. */
  gstRatePercent?: number;
  variants: {
    id: string;
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
const filtersSchema = z.object({
  q: z.string().max(100).default(""),
  category: z.string().max(60).default(""),
  sort: z
    .enum(["featured", "price-asc", "price-desc", "discount", "new"])
    .catch("featured"),
  inStock: z.string().optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  slug: z.string().max(100).optional(),
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
/** Far more than the shop lists today. */
const SHELF_LIMIT = 2000;
/** A search returns its best matches, up to this many. */
const SEARCH_LIMIT = 500;

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
};

/**
 * Everything a product list needs, in one round of parallel queries, shared by every list on
 * the page: the home page asks for three lists and the product page two. Before, each list made
 * four trips to the database one after another, which is what made pages slow on Atlas.
 * Memoised per request only, so stock and prices are always current.
 */
const shelfFor = cache(async (audience: "customers" | "schools"): Promise<Shelf> => {
  await connectDB();
  const [products, variants, inventory, reviews] = await Promise.all([
    Product.find(audience === "schools" ? schoolVisible : shopperVisible)
      .sort({ bestseller: -1, createdAt: 1 })
      .limit(SHELF_LIMIT)
      .lean<Doc[]>(),
    // a hidden pack isn't offered; older packs have no flag and stay on
    ProductVariant.find({ active: { $ne: false } }).lean<Doc[]>(),
    InventoryItem.find({}).select("variantId onHand reserved").lean<Doc[]>(),
    ProductReview.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$productId", rating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
    ]),
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
  };
});

/** What shoppers can buy now, with packs and stock: the basket reads its lines from here too. */
export const shopShelf = () => shelfFor("customers");

/** The products matching a search, best match first, or null when there's no search. */
async function searchMatches(query: string, match: Record<string, unknown>, order: Record<string, SortOrder>) {
  if (!query) return null;
  let products: Doc[] | null = null;
  if (process.env.ATLAS_SEARCH_ENABLED === "true") {
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
    products = await Product.aggregate(pipeline).catch((error: unknown) => {
      log("warn", "catalog.atlas_search_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
  }
  if (products?.length) return products;
  // built-in search (also the fallback when Atlas finds nothing): every word must match
  const [groups, aisles] = await Promise.all([
    SearchSynonym.find({}).select("synonyms").limit(1000),
    Category.find({}).select("slug name").limit(200),
  ]);
  const words = searchWords(query, [...defaultSynonyms, ...groups.map((g) => g.synonyms as string[])]);
  const clause = (pattern: string) => {
    const regex = new RegExp(pattern, "i");
    const slugs = aisles
      .filter((aisle) => regex.test(aisle.name.en) || regex.test(aisle.name.mr))
      .map((aisle) => aisle.slug);
    return {
      $or: [
        ...["name.en", "name.mr", "brand", "aliases"].map((path) => ({
          [path]: { $regex: pattern, $options: "i" },
        })),
        ...(slugs.length ? [{ categorySlug: { $in: slugs } }] : []),
      ],
    };
  };
  let found: Doc[] = await Product.find({
    ...match,
    $and: words.map((alternatives) => clause(wordPattern(alternatives))),
  })
    .sort(order)
    .limit(SEARCH_LIMIT);
  // nothing at all: allow one wrong, missing or extra letter per word ("notbook", "pencel")
  const fuzzy = found.length
    ? null
    : words.map((alternatives) => [...new Set(alternatives.slice(0, 2))].map(fuzzyPattern).join("|"));
  if (fuzzy)
    found = await Product.find({ ...match, $and: fuzzy.map(clause) })
      .sort(order)
      .limit(SEARCH_LIMIT);
  type Scored = Parameters<typeof relevance>[0];
  const scored = new Map(
    found.map((product) => [
      String(product._id),
      fuzzy ? patternRelevance(product as Scored, fuzzy) : relevance(product as Scored, query, words),
    ]),
  );
  return found.sort((a, b) => scored.get(String(b._id))! - scored.get(String(a._id))!);
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
    ...(filters.category ? { categorySlug: filters.category } : {}),
  };
  const query = normalizeSearch(filters.q);
  const order: Record<string, SortOrder> =
    filters.sort === "new" ? { createdAt: -1 } : { bestseller: -1, createdAt: 1 };
  await connectDB();
  // the shelf and a search go to the database at the same time
  const [shelf, matches] = await Promise.all([shelfFor(audience), searchMatches(query, match, order)]);
  let products: Doc[];
  if (matches) products = matches.map((found) => shelf.byId.get(String(found._id))).filter((p): p is Doc => Boolean(p));
  else {
    products = shelf.products.filter(
      (p) => (!filters.slug || p.slug === filters.slug) && (!filters.category || p.categorySlug === filters.category),
    );
    if (filters.sort === "new")
      products = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  let result: CatalogItem[] = products
    .map((p) => {
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
        ...(forSchools && p.gstRatePercent != null ? { gstRatePercent: p.gstRatePercent } : {}),
        rating: reviews?.rating ?? 0,
        reviewCount: reviews?.reviewCount ?? 0,
        variants: (shelf.variants.get(String(p._id)) ?? []).map((v) => ({
          id: String(v._id),
          label: v.label,
          pricePaise: v.pricePaise,
          mrpPaise: v.mrpPaise,
          maxQuantity: v.maxQuantity ?? 10,
          ...(forSchools && v.schoolPricePaise != null ? { schoolPricePaise: v.schoolPricePaise } : {}),
          available: shelf.available.get(String(v._id)) ?? 0,
        })),
      };
    })
    .filter((p) => p.variants.length > 0);
  if (filters.inStock === "true")
    result = result.filter((p) => p.variants.some((v) => v.available > 0));
  if (filters.rating)
    result = result.filter((product) => product.rating >= filters.rating!);
  if (filters.sort === "price-asc")
    result.sort((a, b) => a.variants[0].pricePaise - b.variants[0].pricePaise);
  if (filters.sort === "price-desc")
    result.sort((a, b) => b.variants[0].pricePaise - a.variants[0].pricePaise);
  if (filters.sort === "discount")
    result.sort(
      (a, b) =>
        1 -
        b.variants[0].pricePaise / b.variants[0].mrpPaise -
        (1 - a.variants[0].pricePaise / a.variants[0].mrpPaise),
    );
  // a search keeps its best-match order; browsing leads with the stationery aisles
  if (filters.sort === "featured" && !query) {
    const preferred = ["stationery", "paper", "office", "art-craft"];
    result.sort((a, b) => {
      const aRank = preferred.indexOf(a.categorySlug);
      const bRank = preferred.indexOf(b.categorySlug);
      return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank);
    });
  }
  return result;
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

export async function catalogCategories() {
  await connectDB();
  const rows = await Category.find({})
    .sort({ parentId: 1, "name.en": 1 })
    .limit(200);
  const preferred = [
    "stationery",
    "paper",
    "school",
    "art-craft",
    "gift-sets",
    "gift-wrap",
    "cards",
    "decor",
    "toys",
    "party",
    "office",
  ];
  return rows.map((row) => ({
    id: String(row._id),
    slug: row.slug,
    en: row.name.en,
    mr: row.name.mr,
    symbol: row.symbol ?? "",
    parentId: row.parentId ? String(row.parentId) : undefined,
  })).sort((a, b) => {
    const aRank = preferred.indexOf(a.slug);
    const bRank = preferred.indexOf(b.slug);
    const byPriority = (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank);
    return byPriority || a.en.localeCompare(b.en);
  });
}
