"use client";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownLeft, File, Package, Search, SlidersHorizontal, UserRound, UserRoundSearch, X, Zap, ReceiptText, type LucideIcon } from "lucide-react";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import type { RecordHit } from "@/lib/staff/records";
import type { Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import { findInWorkspace, type FinderGroup, type FinderGroupKind, type FinderHit } from "@/lib/staff/finder";
import { highlightTarget } from "./hash-target";

const KIND_ICONS: Record<FinderGroupKind, LucideIcon> = {
  product: Package,
  order: ReceiptText,
  customer: UserRound,
  record: ReceiptText,
  setting: SlidersHorizontal,
  action: Zap,
  page: File,
  goto: File,
};
const noop = () => () => {};

type Scope = "all" | "product" | "order" | "customer" | "settings";
/** Which chip a result belongs to: "Orders matching…" goes with orders, "Customers matching…" with customers. */
const scopeOf = (hit: FinderHit): Exclude<Scope, "all"> =>
  hit.kind === "record"
    ? hit.id === "record.customers"
      ? "customer"
      : "order"
    : hit.kind === "product" || hit.kind === "order" || hit.kind === "customer"
      ? hit.kind
      : "settings";
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The workspace search. Settings, actions and pages are found in the browser as you type; real
 * products, orders and customers come from the server a moment later (/api/staff/search), each only
 * for staff allowed to open them. Chips narrow it to one kind. As a dropdown under the header bar, or
 * inline in the phone's search sheet. Follows the combobox pattern: focus stays in the box, ↑ ↓ move,
 * Enter opens.
 */
export function StaffFinder({
  roles,
  locale,
  variant,
  inputRef,
  onPick,
}: {
  roles: readonly Role[];
  locale: Locale;
  variant: "popover" | "inline";
  inputRef?: RefObject<HTMLInputElement | null>;
  onPick?: () => void;
}) {
  const text = staffCopy[locale].search;
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [said, setSaid] = useState("");
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const [scope, setScope] = useState<Scope>("all");
  const [live, setLive] = useState<{ q: string; hits: RecordHit[] } | null>(null);
  const canProducts = hasPermission(roles, "catalog:write");
  const canOrders = hasPermission(roles, "order:manage");
  const trimmed = query.trim();
  const asks = trimmed.length >= 2 && (canProducts || canOrders);
  // products, orders and customers from the server, a moment after typing pauses
  useEffect(() => {
    if (!asks) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/staff/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (response.ok) setLive({ q: trimmed, hits: (await response.json()).hits ?? [] });
      } catch {
        // a dropped request leaves the last results up
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [asks, trimmed]);
  const searching = asks && live?.q !== trimmed;
  const found = useMemo(() => findInWorkspace(query, { roles, locale }), [query, roles, locale]);
  const all = useMemo(() => {
    // the last answer stays up until the next arrives, so the list doesn't blink while typing
    const records = asks && live ? live.hits : [];
    const liveGroups = (["order", "customer", "product"] as const)
      .map((kind): FinderGroup => ({
        kind,
        hits: records
          .filter((hit) => hit.kind === kind)
          .map((hit) => ({ id: hit.id, kind, title: hit.title, hint: hit.hint, href: hit.href, image: hit.image })),
      }))
      .filter((group) => group.hits.length);
    // real records lead: an order or phone number with its orders, a word with its products. Settings
    // match loosely ("pen" is in "open" and "pending"), so they follow; "See all…" links come last.
    const products = liveGroups.filter((group) => group.kind === "product");
    const people = liveGroups.filter((group) => group.kind !== "product");
    const lead = found[0]?.kind === "record" ? [...people, ...products] : [...products, ...people];
    return [...lead, ...found.filter((group) => group.kind !== "record"), ...found.filter((group) => group.kind === "record")];
  }, [found, live, asks]);
  const scopes = (["all", ...(canProducts ? ["product"] : []), ...(canOrders ? ["order", "customer"] : []), "settings"] as Scope[]);
  const counts = (target: Scope) =>
    all.flatMap((group) => group.hits).filter((hit) => hit.kind !== "record" && (target === "all" || scopeOf(hit) === target)).length;
  const groups = scope === "all" ? all : all.map((group) => ({ ...group, hits: group.hits.filter((hit) => scopeOf(hit) === scope) })).filter((group) => group.hits.length);
  const hits = groups.flatMap((group) => group.hits);
  const shown = variant === "inline" || open;
  const nothing = Boolean(trimmed) && !searching && !hits.some((hit) => hit.kind !== "record");
  const current = Math.min(active, Math.max(hits.length - 1, 0));
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  // tell screen readers how many results there are once typing pauses
  useEffect(() => {
    if (!shown || !trimmed) return;
    const timer = window.setTimeout(() => setSaid(nothing ? text.empty(trimmed) : text.count(hits.length)), 500);
    return () => window.clearTimeout(timer);
  }, [shown, trimmed, nothing, hits.length, text]);

  // a tap or click anywhere else closes the dropdown
  useEffect(() => {
    if (variant !== "popover" || !open) return;
    const outside = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [variant, open]);

  // the active option stays in view while arrowing through a long list
  useEffect(() => {
    if (shown) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  });

  const picked = (hit: FinderHit) => {
    setOpen(false);
    setQuery("");
    setActive(0);
    setScope("all");
    highlightTarget(hit.href);
    onPick?.();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown) return setOpen(true);
      if (!hits.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[current];
      if (!shown || !hit) return;
      picked(hit);
      router.push(hit.href);
    } else if (event.key === "Escape") {
      // first Escape closes the list, the next clears the box; in the sheet, a last one closes the sheet
      if (variant === "popover" && open) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        setQuery("");
        setActive(0);
      }
    } else if (event.key === "Tab" && variant === "popover") setOpen(false);
  };

  // each option's place in the whole list, for ↑ ↓ and aria-activedescendant
  const starts = groups.map((_, at) => groups.slice(0, at).reduce((sum, group) => sum + group.hits.length, 0));
  return (
    <form
      ref={formRef}
      role="search"
      aria-label={text.label}
      className={`staff-finder is-${variant === "inline" ? "inline" : "dropdown"}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="sr-only" htmlFor={`${id}-input`}>
        {text.label}
      </label>
      <div className="search finder-field">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && hits.length ? optionId(current) : undefined}
          value={query}
          placeholder={text.placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={60}
          enterKeyHint="go"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            aria-label={text.clear}
            onClick={() => {
              setQuery("");
              setActive(0);
              (inputRef?.current ?? formRef.current?.querySelector("input"))?.focus();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : (
          variant === "popover" && (
            <kbd className="finder-kbd" aria-hidden="true">
              {mac ? "⌘K" : "Ctrl K"}
            </kbd>
          )
        )}
      </div>
      <div className="finder-popover" hidden={!shown}>
        {trimmed && scopes.length > 2 && (
          <div className="finder-scopes" role="group" aria-label={text.label}>
            {scopes.map((item) => {
              const count = counts(item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={scope === item}
                  // the box keeps the focus, so ↑ ↓ and Enter still work after a tap
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setScope(item);
                    setActive(0);
                  }}
                >
                  {text.scopes[item]}
                  {item !== "all" && count > 0 && <b>{count}</b>}
                </button>
              );
            })}
          </div>
        )}
        {searching && !hits.length && <p className="finder-empty">{text.searching}</p>}
        {nothing && <p className="finder-empty">{text.empty(trimmed)}</p>}
        <div id={listId} role="listbox" aria-label={text.label}>
          {groups.map((group, at) => (
            <div role="group" aria-label={text.groups[group.kind]} key={group.kind} className="finder-group">
              <span className="finder-group-label" aria-hidden="true">
                {text.groups[group.kind]}
              </span>
              {group.hits.map((hit, place) => {
                const mine = starts[at] + place;
                const Icon = hit.id === "record.customers" ? UserRoundSearch : KIND_ICONS[hit.kind];
                return (
                  <Link
                    key={hit.id}
                    id={optionId(mine)}
                    role="option"
                    aria-selected={mine === current}
                    tabIndex={-1}
                    href={hit.href}
                    className="finder-option"
                    onMouseMove={() => mine !== current && setActive(mine)}
                    onClick={() => picked(hit)}
                  >
                    {hit.image ? (
                      <Image src={hit.image} alt="" width={32} height={32} className="finder-thumb" loading="eager" />
                    ) : (
                      <Icon size={18} aria-hidden="true" />
                    )}
                    <span>
                      <strong>{hit.title}</strong>
                      {hit.hint && <small>{hit.hint}</small>}
                    </span>
                    <CornerDownLeft size={15} aria-hidden="true" className="finder-enter" />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <p className="finder-keys" aria-hidden="true">
          {text.keys}
        </p>
      </div>
      {/* only while the list is open, so pages keep their own single status message */}
      {shown && (
        <p className="sr-only" role="status">
          {trimmed ? said : ""}
        </p>
      )}
    </form>
  );
}
