"use client";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { cleanUrl, scrub } from "@/lib/analytics-url";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}
// Google's own queue: commands wait here until gtag.js arrives, and it reads only `arguments` objects
const gtag: (...args: unknown[]) => void = function () {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
};

/** Where on the page a link sits: a home section's id ("popular", "aisles"), a labelled menu, or the landmark. */
function sectionOf(link: Element) {
  for (let el = link.parentElement; el; el = el.parentElement) {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) return labelledBy.replace(/-title$/, "");
    const label = el.getAttribute("aria-label");
    if (label) return label;
    if (/^(HEADER|FOOTER|NAV|MAIN|ASIDE)$/.test(el.tagName)) return el.tagName.toLowerCase();
  }
  return "page";
}

/**
 * Google Analytics 4 on every shopper's page, no cookie question: the shop serves Raigad only and
 * the owner chose this on 2026-11-07; the privacy policy says so and how to block it.
 * Page views are sent from here, not by the stream's "page changes based on browser history
 * events" (switch that off in GA), so every address is cleaned first: secret links masked, no
 * emails or phone numbers. Every link tapped inside the shop is a `link_click` with where it
 * points, its words and its section; links to other sites are the stream's own outbound clicks.
 * Google signals and ad personalisation are off.
 */
export function Analytics({ id }: { id: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const last = useRef<string | null>(null);

  useEffect(() => {
    gtag("js", new Date());
    gtag("config", id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href, window.location.href);
      if (/^https?:$/.test(url.protocol) && url.origin !== window.location.origin) return;
      // innerText keeps the line breaks between a card's badge, name and pack, so the words don't run together
      // data-analytics-label stands in for words people typed themselves, like a conversation's title
      const words = (link.dataset.analyticsLabel || link.getAttribute("aria-label") || link.innerText || "").replace(/\s+/g, " ").trim();
      gtag("event", "link_click", {
        link_target: cleanUrl(link.href, window.location.origin),
        link_label: scrub(words).slice(0, 100),
        link_section: sectionOf(link),
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [id]);

  useEffect(() => {
    const here = cleanUrl(window.location.href, window.location.origin);
    // a query value that cleaning drops (?edit=…) doesn't make a new page
    if (here === last.current) return;
    const from = last.current ?? (document.referrer ? cleanUrl(document.referrer, window.location.origin) : undefined);
    // later events on this page (outbound clicks, scrolls) carry the clean address too
    gtag("set", { page_location: here, page_referrer: from });
    gtag("event", "page_view", { page_location: here, page_referrer: from, page_title: document.title });
    last.current = here;
  }, [pathname, search]);

  // after the page has loaded, not before: gtag.js is ~196 KB and "afterInteractive" preloaded it in <head>, where it
  // took about a second of a 4G phone's bandwidth from the styles the first paint waits for. Page views typed
  // into the queue above still go once it arrives; only a visit that leaves within the first seconds goes uncounted.
  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" />;
}
