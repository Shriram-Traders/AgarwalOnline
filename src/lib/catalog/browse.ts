/*
 * Browsing the shop: one shelf, a search, the sort and "in stock only", over products already in
 * memory. Plain code with no database, so the server (queries.ts, on its cached shelf) and the
 * shopper's phone (catalog-browser.tsx, on the whole catalogue it loaded once) give the same answer.
 */
import { defaultSynonyms, fuzzyPattern, normalizeSearch, patternRelevance, relevance, searchWords, wordPattern } from "./search";

/** The shop's sections, then its aisles, in display order: menus, the aisle tiles and browsing follow it; unlisted ones come after, by name. */
export const AISLE_ORDER = [
  // the categories that subcategories are grouped under (src/lib/catalog/sections.ts)
  "stationery",
  "office",
  "toys-games",
  "gifts-party",
  "food",
  "home-pooja",
  "pens",
  "pencils",
  "colours-markers",
  "long-books",
  "notebooks",
  "diaries",
  "project-paper",
  "school-essentials",
  "art-craft",
  "office-supplies",
  // toys and games (Ratna's catalogue, 2026-10-16)
  "games-puzzles",
  "learning-toys",
  "building-sets",
  "outdoor-play",
  "pretend-play",
  "baby-toddler",
  // everyday things beside the stationery (the owner's photos, 2026-10-19)
  "chocolates-sweets",
  // packaged foods (the owner's pack photos, 2026-11-13)
  "namkeen-papad",
  "instant-mixes",
  "pooja-needs",
  "home-essentials",
  "party-gifting",
];
export const aisleRank = (slug: string) => AISLE_ORDER.indexOf(slug) + 1 || 99;
/** Every shelf a product shows on: its own first, then the extra ones. */
export const shelvesOf = (product: { categorySlug: string; alsoOn?: string[] }): string[] => [product.categorySlug, ...(product.alsoOn ?? [])];

/** What browsing reads of a product. */
export type BrowseFields = {
  id: string;
  slug: string;
  name: { en: string; mr: string };
  brand: string;
  aliases: string[];
  categorySlug: string;
  alsoOn: string[];
  bestseller: boolean;
  /** When it was added, in milliseconds: "Recently added". */
  createdAt: number;
  rating: number;
  variants: { pricePaise: number; mrpPaise: number; available: number }[];
};
export type BrowseFilters = {
  q: string;
  category: string;
  sort: "featured" | "price-asc" | "price-desc" | "discount" | "new";
  inStock?: string;
  rating?: number;
  slug?: string;
};
export type Aisle = { slug: string; en: string; mr: string };
export type BrowseContext = {
  /** Shelves by name: a search for "namkeen" finds what's on Namkeen & Papad. */
  aisles: Aisle[];
  /** The owner's synonym groups ("copy" = "notebook"). */
  synonyms: string[][];
  /** The school catalogue asks for quotations: no in-stock-first. */
  forSchools?: boolean;
  /** Ids an outside search (Atlas) found, best first; leaves the built-in search out. */
  matched?: string[] | null;
};

/** A search returns its best matches, up to this many. */
const SEARCH_LIMIT = 500;

/**
 * The products matching a search, best match first: every word must match the name, brand, an
 * alias or the shelf's name; plurals and synonyms count, and when nothing matches one wrong,
 * missing or extra letter per word is forgiven ("notbook", "pencel").
 */
export function searchProducts<T extends BrowseFields>(listed: T[], query: string, aisles: Aisle[], synonyms: string[][]): T[] {
  const words = searchWords(query, [...defaultSynonyms, ...synonyms]);
  const clause = (pattern: string) => {
    const regex = new RegExp(pattern, "i");
    const slugs = new Set(aisles.filter((aisle) => regex.test(aisle.en) || regex.test(aisle.mr)).map((aisle) => aisle.slug));
    return (product: T) =>
      shelvesOf(product).some((slug) => slugs.has(slug)) ||
      [product.name?.en, product.name?.mr, product.brand, ...(product.aliases ?? [])].some(
        (text) => typeof text === "string" && regex.test(text),
      );
  };
  const find = (patterns: string[]) => {
    const tests = patterns.map(clause);
    return listed.filter((product) => tests.every((test) => test(product))).slice(0, SEARCH_LIMIT);
  };
  let found = find(words.map(wordPattern));
  const fuzzy = found.length
    ? null
    : words.map((alternatives) => [...new Set(alternatives.slice(0, 2))].map(fuzzyPattern).join("|"));
  if (fuzzy) found = find(fuzzy);
  const scored = new Map(found.map((product) => [product.id, fuzzy ? patternRelevance(product, fuzzy) : relevance(product, query, words)]));
  return found.sort((a, b) => scored.get(b.id)! - scored.get(a.id)!);
}

/**
 * One shelf (or the whole shop), searched, filtered and sorted. `items` come in the shop's
 * "featured" order: bestsellers first, then oldest first.
 */
export function browseCatalog<T extends BrowseFields>(items: T[], filters: BrowseFilters, context: BrowseContext): T[] {
  const query = normalizeSearch(filters.q);
  let listed = items.filter(
    (p) =>
      p.variants.length > 0 &&
      (!filters.slug || p.slug === filters.slug) &&
      (!filters.category || shelvesOf(p).includes(filters.category)),
  );
  if (filters.sort === "new") listed = [...listed].sort((a, b) => b.createdAt - a.createdAt);
  let result: T[];
  if (context.matched) {
    const byId = new Map(listed.map((product) => [product.id, product]));
    result = context.matched.map((id) => byId.get(id)).filter((product): product is T => Boolean(product));
  } else result = query ? searchProducts(listed, query, context.aisles, context.synonyms) : [...listed];
  if (filters.inStock === "true") result = result.filter((p) => p.variants.some((v) => v.available > 0));
  if (filters.rating) result = result.filter((product) => product.rating >= filters.rating!);
  if (filters.sort === "price-asc") result.sort((a, b) => a.variants[0].pricePaise - b.variants[0].pricePaise);
  if (filters.sort === "price-desc") result.sort((a, b) => b.variants[0].pricePaise - a.variants[0].pricePaise);
  if (filters.sort === "discount")
    result.sort(
      (a, b) =>
        1 - b.variants[0].pricePaise / b.variants[0].mrpPaise - (1 - a.variants[0].pricePaise / a.variants[0].mrpPaise),
    );
  // a search keeps its best-match order; browsing goes aisle by aisle, bestsellers first, then by
  // name with numbers read as numbers: one brand's books sit together, 72 pages before 172. On one
  // shelf the aisle is left out of it, or a product that is only also shown there would jump ahead.
  if (filters.sort === "featured" && !query && !context.matched)
    result.sort(
      (a, b) =>
        (filters.category
          ? 0
          : aisleRank(a.categorySlug) - aisleRank(b.categorySlug) || a.categorySlug.localeCompare(b.categorySlug)) ||
        Number(b.bestseller) - Number(a.bestseller) ||
        a.name.en.localeCompare(b.name.en, "en", { numeric: true }),
    );
  // what can be bought now comes first, in the order the list already has (the sort keeps ties as
  // they were); sold-out products stay listed after it. Shoppers only: a school asks for a quotation.
  const buyable = (product: T) => product.variants.some((variant) => variant.available > 0);
  if (!context.forSchools) result.sort((a, b) => Number(buyable(b)) - Number(buyable(a)));
  return result;
}

const SORTS = ["featured", "price-asc", "price-desc", "discount", "new"] as const;
/** The filters from a page address, read the way the server reads them (a bad value falls back). */
export function filtersFrom(params: { get(name: string): string | null }): BrowseFilters {
  const sort = params.get("sort");
  const rating = Number(params.get("rating"));
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    category: (params.get("category") ?? "").slice(0, 60),
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as BrowseFilters["sort"]) : "featured",
    inStock: params.get("inStock") ?? undefined,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
  };
}

/** Which list a set of filters makes; the page and `in` (the section a shelf was opened from) don't change it. */
export const viewKey = (filters: BrowseFilters) => [filters.category, filters.q, filters.sort, filters.inStock ?? "", filters.rating ?? ""].join("|");
/** The same, from a page's search params as the server receives them. */
export const viewKeyOf = (params: Record<string, string | string[] | undefined>) =>
  viewKey(filtersFrom(new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"))));
