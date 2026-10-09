"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import { formatPrice } from "@/lib/display";

type Suggestion = {
  slug: string;
  name: { en: string; mr: string };
  brand: string;
  pricePaise: number;
  /** Said instead of the price, e.g. "₹42.50 + GST" in the school marketplace. */
  priceText?: string;
};

/**
 * The header search with live suggestions. The shop's is the default; the school marketplace
 * points it at its own catalogue, suggestions and product pages.
 */
export function SmartSearch({
  placeholder,
  hints = [],
  label = "Search products",
  action = "/catalog",
  suggestUrl = "/api/catalog/suggestions",
  productBase = "/products/",
}: {
  placeholder: string;
  hints?: string[];
  label?: string;
  action?: string;
  suggestUrl?: string;
  productBase?: string;
}) {
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState(0);
  useEffect(() => {
    if (hints.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHint((i) => (i + 1) % hints.length), 2600);
    return () => window.clearInterval(timer);
  }, [hints.length]);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${suggestUrl}?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (response.ok) setResults(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setResults([]);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, suggestUrl]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const expanded = open && results.length > 0;
  const pathname = usePathname();
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  // the account pages are about the shopper, not the shelves, and checkout is for finishing
  // the order: no product search on either
  if (under("/account") || under("/checkout") || under("/school/checkout")) return null;
  // the basket keeps it on a computer, where it sits in the header row; a phone gives the
  // pinned row to the items and the bill (styled in globals.css)
  const phoneHidden = under("/cart") || under("/school/basket");
  return (
    <div
      className={phoneHidden ? "smart-search phone-hidden" : "smart-search"}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <form action={action} className="search" role="search">
        <Search size={20} aria-hidden="true" />
        <input
          name="q"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) setResults([]);
            setOpen(value.trim().length >= 2);
          }}
          onFocus={() => setOpen(true)}
          aria-label={label}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={hints.length ? `${placeholder} · “${hints[hint]}”` : placeholder}
          maxLength={100}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        ) : (
          <button aria-label="Search">
            <Search size={18} />
          </button>
        )}
      </form>
      {expanded && (
        <div className="search-popover" id={listId} role="listbox" aria-label="Suggestions">
          {results.map((result) => (
            <Link
              key={result.slug}
              href={`${productBase}${result.slug}`}
              role="option"
              aria-selected={false}
              onClick={() => setOpen(false)}
            >
              <span>
                <strong>{result.name.en}</strong>
                <small>
                  {result.name.mr} · {result.brand}
                </small>
              </span>
              <b>{result.priceText ?? formatPrice(result.pricePaise)}</b>
            </Link>
          ))}
          <Link
            className="search-all"
            href={`${action}?q=${encodeURIComponent(query)}`}
            onClick={() => setOpen(false)}
          >
            See all results <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
