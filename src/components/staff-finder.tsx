"use client";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownLeft, File, Search, SlidersHorizontal, UserRoundSearch, X, Zap, ReceiptText, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import { findInWorkspace, type FinderGroupKind, type FinderHit } from "@/lib/staff/finder";
import { highlightTarget } from "./hash-target";

const KIND_ICONS: Record<FinderGroupKind, LucideIcon> = {
  record: ReceiptText,
  setting: SlidersHorizontal,
  action: Zap,
  page: File,
  goto: File,
};
const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The workspace search. It finds settings, actions and pages (not shop products), plus orders
 * and customers by number, name or phone. As a dropdown under the header bar, or inline in the
 * phone's search sheet. Follows the combobox pattern: focus stays in the box, ↑ ↓ move, Enter opens.
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
  const groups = useMemo(() => findInWorkspace(query, { roles, locale }), [query, roles, locale]);
  const hits = groups.flatMap((group) => group.hits);
  const shown = variant === "inline" || open;
  const trimmed = query.trim();
  const nothing = Boolean(trimmed) && !hits.some((hit) => hit.kind !== "record");
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
                    <Icon size={18} aria-hidden="true" />
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
