"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { Suspense, useState } from "react";
import { LiveFilter } from "./filter-live";

export function CatalogFilterPanel({
  locale,
  params,
  navigate,
}: {
  locale: "en" | "mr";
  params: Record<string, string | undefined>;
  /** Changes the list in the browser when it can (catalog-browser.tsx); false leaves it to the server. */
  navigate?: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = [params.inStock, params.sort && params.sort !== "featured"].filter(Boolean).length;

  return (
    <>
      <div className="filter-toggle-row">
        <button
          type="button"
          className="secondary-button filter-toggle"
          aria-expanded={open}
          aria-controls="catalog-filter-form"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={18} /> : <SlidersHorizontal size={18} />}
          {locale === "mr" ? "फिल्टर आणि क्रमवारी" : "Filter & sort"}
          {activeCount > 0 && <span>{activeCount}</span>}
        </button>
      </div>
      <form
        id="catalog-filter-form"
        className={`catalog-filters${open ? " is-open" : ""}`}
        action="/catalog"
      >
        <label>
          {locale === "mr" ? "शोधा" : "Search"}
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            maxLength={100}
            placeholder={locale === "mr" ? "वही, पेन, खेळ…" : "Notebook, pen, puzzle…"}
          />
        </label>
        {/* every control applies itself as you type or pick, without reloading the page */}
        <Suspense fallback={null}>
          <LiveFilter navigate={navigate} />
        </Suspense>
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {/* the section the shelf was opened from: its rail stays */}
        {params.in && <input type="hidden" name="in" value={params.in} />}
        <label>
          {locale === "mr" ? "क्रमवारी" : "Sort by"}
          <select name="sort" defaultValue={params.sort && params.sort !== "featured" ? params.sort : ""}>
            {/* empty: the shop's own order, so it never lands in the address as a filter */}
            <option value="">{locale === "mr" ? "लोकप्रिय" : "Featured"}</option>
            <option value="price-asc">{locale === "mr" ? "किंमत: कमी ते जास्त" : "Price: low to high"}</option>
            <option value="price-desc">{locale === "mr" ? "किंमत: जास्त ते कमी" : "Price: high to low"}</option>
            <option value="discount">{locale === "mr" ? "सर्वात मोठी बचत" : "Biggest savings"}</option>
            <option value="new">{locale === "mr" ? "नव्याने जोडलेले" : "Recently added"}</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="inStock" value="true" defaultChecked={params.inStock === "true"} />
          {locale === "mr" ? "फक्त उपलब्ध" : "In stock only"}
        </label>
      </form>
    </>
  );
}
