"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const EVENT = "ags:highlight";
/** The id asked for, and the page it lives on: an element with the same id on the page being left doesn't count. */
let pending: { id: string; path: string } | null = null;

/**
 * Asks for the part of the page a link points at (its #id) to be brought into view, focused and
 * briefly lit once it appears. Only the workspace search, the alerts bell and the settings cards
 * ask, so ordinary filter links that end in #orders don't flash.
 */
export function highlightTarget(href: string) {
  const url = new URL(href, window.location.href);
  if (!url.hash) return;
  pending = { id: decodeURIComponent(url.hash.slice(1)), path: url.pathname };
  window.dispatchEvent(new Event(EVENT));
}

function reveal(element: HTMLElement) {
  // a target inside a closed <details> (like the one-off delivery time) can't be seen until it opens
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    if (node instanceof HTMLDetailsElement) node.open = true;
  if (!element.matches("a, button, input, select, textarea, summary, [tabindex]")) element.tabIndex = -1;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  element.focus({ preventScroll: true });
  element.classList.remove("is-targeted");
  // restart the glow when the same target is asked for twice
  void element.offsetWidth;
  element.classList.add("is-targeted");
  window.setTimeout(() => element.classList.remove("is-targeted"), 2400);
}

/** Lives once in the staff layout and waits for the asked-for element, which may arrive with the next page. */
export function HashTarget() {
  const pathname = usePathname();
  useEffect(() => {
    let timer = 0;
    let tries = 0;
    const look = () => {
      window.clearTimeout(timer);
      if (!pending) return;
      const element = window.location.pathname === pending.path ? document.getElementById(pending.id) : null;
      if (element) {
        pending = null;
        reveal(element);
      } else if (++tries < 30) timer = window.setTimeout(look, 100);
      else pending = null;
    };
    const start = () => {
      tries = 0;
      look();
    };
    start();
    window.addEventListener(EVENT, start);
    window.addEventListener("hashchange", start);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENT, start);
      window.removeEventListener("hashchange", start);
    };
  }, [pathname]);
  return null;
}

/** A link that also lights up where it lands, e.g. the Store settings cards. */
export function HighlightLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => highlightTarget(href)}>
      {children}
    </a>
  );
}
