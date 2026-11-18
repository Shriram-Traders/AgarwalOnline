"use client";
import { ViewTransition, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, SearchX } from "lucide-react";
import { browseCatalog, filtersFrom, viewKey, type Aisle, type BrowseFields } from "@/lib/catalog/browse";
import { aisleSummary } from "@/lib/seo";
import { AisleIcon } from "./aisle-icon";
import { CatalogFilterPanel } from "./catalog-filter-panel";
import { CentreCurrent } from "./centre-current";
import { ProductCardView, type CardItem } from "./product-card-view";

export type Shelf = { slug: string; en: string; mr: string };
export type Section = Shelf & { shelves: Shelf[] };
type Item = CardItem & BrowseFields;
type Catalogue = { at: number; items: Item[]; aisles: Aisle[]; synonyms: string[][] };

/** How long the copy in memory counts as fresh: the CDN's own copy is at most 30 seconds older. */
const FRESH_FOR = 60_000;
// the whole shop, kept for the visit: leaving the category page and coming back doesn't load it again
let kept: Catalogue | null = null;
let asking: Promise<Catalogue | null> | null = null;
function loadCatalogue(): Promise<Catalogue | null> {
  if (kept && Date.now() - kept.at < FRESH_FOR) return Promise.resolve(kept);
  asking ??= fetch("/api/catalog/all")
    .then((response) => (response.ok ? (response.json() as Promise<Catalogue>) : null))
    .then((data) => {
      if (data?.items) kept = { ...data, at: Date.now() };
      return kept;
    })
    .catch(() => kept)
    .finally(() => {
      asking = null;
    });
  return asking;
}


/** A link to another view of the category page: on the phone when the catalogue is here, else to the server. */
function ShelfLink({ href, go, onClick, ...rest }: ComponentProps<typeof Link> & { href: string; go: (href: string) => boolean }) {
  return (
    <Link
      href={href}
      // the phone answers these itself once the catalogue is here: no page fetched ahead from the server
      prefetch={false}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (go(href)) {
          event.preventDefault();
          window.scrollTo({ top: 0 });
        }
      }}
    />
  );
}

/**
 * The category page in the browser. It opens on the list the server made for the address, then
 * loads the whole catalogue once (/api/catalog/all) and from then on switches shelves and sections,
 * searches, sorts and filters on the phone with no trip to the server; the address changes as it
 * would, so Back, a refresh and a shared link all work. Products appear as the shopper scrolls
 * (lazy loading), and photos load as they come into view. Until the catalogue arrives every link
 * still goes to the server, so nothing waits on it.
 */
export function CatalogBrowser({
  locale,
  categories,
  sections,
  photos,
  saved,
  pageSize,
  initial,
}: {
  locale: "en" | "mr";
  categories: Shelf[];
  sections: Section[];
  /** A photo for each shelf in the rail. */
  photos: Record<string, string>;
  /** Products the signed-in shopper saved: their hearts show filled. */
  saved: string[];
  pageSize: number;
  /** What the server found for the address the page opened at. */
  initial: { key: string; items: CardItem[]; total: number; brands: string[]; range: string };
}) {
  const searchParams = useSearchParams();
  const params = useMemo(() => Object.fromEntries(searchParams.entries()) as Record<string, string | undefined>, [searchParams]);
  const filters = useMemo(() => filtersFrom(searchParams), [searchParams]);
  const key = viewKey(filters);
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const mr = locale === "mr";

  const [catalogue, setCatalogue] = useState<Catalogue | null>(kept);
  useEffect(() => {
    let live = true;
    const refresh = () => loadCatalogue().then((data) => live && data && setCatalogue(data));
    refresh();
    // back on the tab after a while: stock and prices are read again
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const browsed = useMemo(
    () => (catalogue ? browseCatalog(catalogue.items, filters, { aisles: catalogue.aisles, synonyms: catalogue.synonyms }) : null),
    [catalogue, filters],
  );
  // until the catalogue is here, the server's list (the page re-renders with a new one if a link went to the server)
  const list: CardItem[] = browsed ?? initial.items;
  const total = browsed ? browsed.length : initial.total;
  const summary = browsed ? aisleSummary(browsed) : { brands: initial.brands, range: initial.range };

  // ?page=3 shows three pages' worth (the server's way too); scrolling down shows more
  const opened = (Math.max(1, Math.min(100, Math.floor(Number(searchParams.get("page"))) || 1))) * pageSize;
  const [grown, setGrown] = useState<{ key: string; count: number } | null>(null);
  const count = grown?.key === key ? grown.count : opened;
  const shown = list.slice(0, count);
  const more = total - shown.length;

  /** Goes to another address on the phone when the catalogue is here; false sends the link to the server. */
  const go = useCallback((href: string, how: "push" | "replace" = "push") => {
    if (!kept) return false;
    if (how === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
    return true;
  }, []);
  const grow = useCallback(() => {
    if (!browsed) return false;
    const next = count + pageSize;
    setGrown({ key, count: next });
    // the address keeps how far down the shopper got, so Back from a product returns to the same place
    const address = new URLSearchParams(searchParams);
    address.set("page", String(Math.ceil(next / pageSize)));
    window.history.replaceState(null, "", `/catalog?${address}`);
    return true;
  }, [browsed, count, pageSize, key, searchParams]);

  // lazy loading: the next products appear as the shopper nears the end of the list
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = end.current;
    if (!element || !browsed || more <= 0) return;
    const watcher = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && grow(), { rootMargin: "800px 0px" });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [browsed, more, grow]);

  const active = categories.find((category) => category.slug === filters.category);
  // The rail lists one section's shelves. A shelf can sit in several: `in` says which one the shopper
  // came through, else its first. Without sections, or on "All", the rail lists every shelf.
  const around = active ? sections.filter((item) => item.shelves.some((shelf) => shelf.slug === active.slug)) : [];
  const section = around.find((item) => item.slug === params.in) ?? around[0];
  const rail = section?.shelves ?? categories;
  const shelfHref = (slug: string, within?: string) => `/catalog?${new URLSearchParams({ category: slug, ...(within ? { in: within } : {}) })}`;
  const allHref = "/catalog";
  const next = active ? rail[rail.findIndex((shelf) => shelf.slug === active.slug) + 1] : undefined;
  // sort and stock filters can be cleared without leaving the shelf; a search clears back to the whole shop
  const filtered = Boolean(filters.q || params.inStock || params.sort);
  const q = filters.q;

  // the tab's title follows the shelf, as a page from the server would set it
  useEffect(() => {
    const name = active
      ? `${active.en} online in Nagothane`
      : q
        ? `Results for “${q.slice(0, 60)}”`
        : filters.sort === "discount"
          ? "Today’s offers and discounts"
          : "All products";
    document.title = `${name} | Agarwal Online`;
  }, [active, q, filters.sort]);

  return (
    <section className={`page-container shelves${q ? " searching" : ""}`}>
      {/* a search looks through the whole shop, so the sections and the rail step aside for it */}
      {!q && sections.length > 0 && (
        <nav className="section-tabs" aria-label={mr ? "विभाग" : "Sections"}>
          <ShelfLink go={go} href={allHref} aria-current={!active ? "page" : undefined}>
            {mr ? "सर्व" : "All"}
          </ShelfLink>
          {sections.map((item) => (
            <ShelfLink go={go} key={item.slug || "more"} href={shelfHref(item.shelves[0].slug, item.slug)} aria-current={section === item ? "true" : undefined}>
              {item[locale]}
            </ShelfLink>
          ))}
        </nav>
      )}
      {!q && (
        <nav className="shelf-rail" aria-label="Browse product categories">
          {sections.length === 0 && (
            <ShelfLink go={go} href={allHref} aria-current={!active ? "page" : undefined}>
              <span className="rail-art quiet">
                <AisleIcon slug="all" />
              </span>
              {mr ? "सर्व" : "All"}
            </ShelfLink>
          )}
          {rail.map((shelf) => {
            const photo = photos[shelf.slug];
            return (
              <ShelfLink go={go} key={shelf.slug} href={shelfHref(shelf.slug, section?.slug)} aria-current={active?.slug === shelf.slug ? "page" : undefined}>
                <span className={photo ? "rail-art" : "rail-art quiet"}>
                  {photo ? <Image src={photo} alt="" fill sizes="56px" /> : <AisleIcon slug={shelf.slug} />}
                </span>
                {shelf[locale]}
              </ShelfLink>
            );
          })}
        </nav>
      )}
      <CentreCurrent key={`rail-${filters.category || "all"}-${section?.slug ?? ""}`} rail=".shelf-rail" />
      <CentreCurrent key={`tabs-${section?.slug ?? "all"}`} rail=".section-tabs" />
      {/* picking another shelf swaps this part with a cross-fade: same place, different products */}
      <ViewTransition key={filters.category || (q ? "search" : "all")} name="shelf-content" share="auto" enter="auto" default="none">
        <div className="shelf-main">
          <div className="shelf-head">
            <div>
              <h1>{active ? active[locale] : q ? (mr ? `“${q.slice(0, 60)}” साठी निकाल` : `Results for “${q.slice(0, 60)}”`) : mr ? "सर्व उत्पादने" : "All products"}</h1>
              {/* how many, then the aisle in a line from its own products: whose, and at what prices */}
              <p className="muted results-line">
                <span>
                  {more > 0 && (mr ? `${shown.length} दाखवत आहोत, एकूण ` : `Showing ${shown.length} of `)}
                  <strong>{total}</strong> {mr ? "उत्पादने" : total === 1 ? "product" : "products"}
                  {q ? (mr ? ` “${q}” साठी` : ` for “${q}”`) : ""}
                  {active &&
                    !q &&
                    total > 0 &&
                    [
                      "",
                      summary.brands.slice(0, 3).join(", ") + (summary.brands.length > 3 ? "…" : ""),
                      // word joiners keep "₹90–₹240" on one line on a phone
                      summary.range.replace("–", "⁠–⁠"),
                    ]
                      .filter((part, index) => !index || part)
                      .join(" · ")}
                </span>
                {filtered && (
                  <ShelfLink go={go} href={active && !q ? shelfHref(active.slug, section?.slug) : allHref}>{mr ? "फिल्टर काढा" : "Clear filters"}</ShelfLink>
                )}
              </p>
            </div>
            <CatalogFilterPanel locale={locale} params={params} navigate={(href) => go(href, "replace")} />
          </div>
          {total ? (
            <>
              <div className="product-grid">
                {shown.map((product, index) => (
                  <ProductCardView key={product.id} product={product} locale={locale} saved={savedSet.has(product.id)} eager={index === 0} />
                ))}
              </div>
              {more > 0 && (
                <div className="load-more" ref={end}>
                  {/* scrolling down shows more by itself; the button is there for anyone who'd rather tap */}
                  <Link
                    href={`/catalog?${new URLSearchParams({ ...Object.fromEntries(searchParams.entries()), page: String(Math.ceil(count / pageSize) + 1) })}`}
                    scroll={false}
                    prefetch={false}
                    className="secondary-button"
                    onClick={(event) => {
                      if (grow()) event.preventDefault();
                    }}
                  >
                    {mr ? `आणखी ${Math.min(more, pageSize)} दाखवा` : `Load ${Math.min(more, pageSize)} more${more > pageSize ? ` of ${more}` : ""}`}
                  </Link>
                </div>
              )}
              {/* the end of a shelf leads on to the next one in the rail */}
              {more <= 0 && next && !q && (
                <div className="load-more">
                  <ShelfLink go={go} href={shelfHref(next.slug, section?.slug)} className="secondary-button">
                    {mr ? "पुढे" : "Next"}: {next[locale]} <ArrowRight size={16} aria-hidden="true" />
                  </ShelfLink>
                </div>
              )}
            </>
          ) : (
            <div className="panel empty-state">
              <SearchX size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
              <h2>{mr ? "उत्पादने सापडली नाहीत" : "No products found"}</h2>
              <p>{mr ? "इंग्रजी किंवा मराठीत दुसरे नाव वापरून पाहा, किंवा फिल्टर काढा." : "Try another name in English or Marathi, or clear your filters."}</p>
              <ShelfLink go={go} href={allHref} className="primary-button">
                {mr ? "सर्व उत्पादने पाहा" : "Show all products"}
              </ShelfLink>
            </div>
          )}
        </div>
      </ViewTransition>
    </section>
  );
}
