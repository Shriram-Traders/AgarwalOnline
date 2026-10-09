"use client";
import { useEffect } from "react";

/**
 * Two things a policy page can't do by itself:
 * - on a phone the tabs are a sideways rail, so the current one could sit out of sight: centre it;
 * - the page streams in after the browser has looked for its #section, so a link like
 *   /p/terms-and-conditions#disputes opened at the top: go there once the section is on the page.
 */
export function PolicyScroll() {
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>(".policy-switcher");
    const current = rail?.querySelector<HTMLElement>("[aria-current]");
    // the rail's own scroll only, so the page itself doesn't move
    if (rail && current)
      rail.scrollLeft +=
        current.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - current.offsetWidth) / 2;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
