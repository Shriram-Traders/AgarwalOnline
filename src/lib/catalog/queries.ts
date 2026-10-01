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
  variants: {
    id: string;
    label: string;
    pricePaise: number;
    mrpPaise: number;
    available: number;
    maxQuantity: number;
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
export async function catalog(
  input: Record<string, string | undefined> = {},
): Promise<CatalogItem[]> {
  const filters = filtersSchema.parse(input);
  await connectDB();
  const match: Record<string, unknown> = {
    status: "published",
    ...(filters.slug ? { slug: filters.slug } : {}),
    ...(filters.category ? { categorySlug: filters.category } : {}),
  };
  const query = normalizeSearch(filters.q);
  let products = null;
  if (query && process.env.ATLAS_SEARCH_ENABLED === "true") {
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
  const order: Record<string, SortOrder> =
    filters.sort === "new" ? { createdAt: -1 } : { bestseller: -1, createdAt: 1 };
  if (!products?.length) {
    if (query) {
      // built-in search (also the fallback when Atlas finds nothing): every word must match
      const groups = await SearchSynonym.find({}).select("synonyms").limit(1000);
      const words = searchWords(query, [
        ...defaultSynonyms,
        ...groups.map((g) => g.synonyms as string[]),
      ]);
      const aisles = await Category.find({}).select("slug name").limit(200);
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
      products = await Product.find({
        ...match,
        $and: words.map((alternatives) => clause(wordPattern(alternatives))),
      })
        .sort(order)
        .limit(100);
      // nothing at all: allow one wrong, missing or extra letter per word ("notbook", "pencel")
      const fuzzy = products.length
        ? null
        : words.map((alternatives) =>
            [...new Set(alternatives.slice(0, 2))].map(fuzzyPattern).join("|"),
          );
      if (fuzzy)
        products = await Product.find({ ...match, $and: fuzzy.map(clause) })
          .sort(order)
          .limit(100);
      const scored = new Map(
        products.map((product) => [
          String(product._id),
          fuzzy ? patternRelevance(product, fuzzy) : relevance(product, query, words),
        ]),
      );
      products.sort((a, b) => scored.get(String(b._id))! - scored.get(String(a._id))!);
    } else products = await Product.find(match).sort(order).limit(100);
  }
  const variants = await ProductVariant.find({
    productId: { $in: products.map((p) => p._id) },
    active: { $ne: false }, // a hidden pack isn't offered; older packs have no flag and stay on
  });
  const inventory = await InventoryItem.find({
    variantId: { $in: variants.map((v) => v._id) },
  });
  const reviewStats = await ProductReview.aggregate([
    { $match: { productId: { $in: products.map((product) => product._id) }, status: "published" } },
    { $group: { _id: "$productId", rating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);
  let result: CatalogItem[] = products
    .map((p) => {
      const reviews = reviewStats.find((row) => String(row._id) === String(p._id));
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
      rating: reviews?.rating ?? 0,
      reviewCount: reviews?.reviewCount ?? 0,
      variants: variants
        .filter((v) => String(v.productId) === String(p._id))
        .map((v) => {
          const stock = inventory.find(
            (i) => String(i.variantId) === String(v._id),
          );
          return {
            id: String(v._id),
            label: v.label,
            pricePaise: v.pricePaise,
            mrpPaise: v.mrpPaise,
            maxQuantity: v.maxQuantity,
            available: Math.max(
              0,
              (stock?.onHand ?? 0) - (stock?.reserved ?? 0),
            ),
          };
        }),
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
