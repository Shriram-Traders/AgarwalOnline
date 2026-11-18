"use client";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const typed = (field: EventTarget | null) =>
  field instanceof HTMLInputElement && !["checkbox", "radio", "date", "datetime-local", "month"].includes(field.type);

/**
 * Makes a staff list's filter bar answer as you go: the list updates a moment after you stop typing,
 * and at once when you pick a choice, without pressing the button (which hides; Enter still works).
 * The address keeps the filters, so Back, a refresh and a shared link show the same list. Without
 * JavaScript the form still submits the old way.
 */
export function LiveFilter({ navigate }: { navigate?: (href: string) => boolean } = {}) {
  const marker = useRef<HTMLSpanElement>(null);
  // a page that can answer in the browser (the category page, once it has the catalogue) takes the address itself
  const handOff = useRef(navigate);
  useEffect(() => {
    handOff.current = navigate;
  });
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    form.toggleAttribute("data-live", true);
    let timer = 0;
    const go = () => {
      window.clearTimeout(timer);
      const next = new URLSearchParams();
      for (const [name, value] of new FormData(form)) if (typeof value === "string" && value.trim()) next.append(name, value.trim());
      const query = next.toString();
      if (query === window.location.search.slice(1)) return;
      const href = `${pathname}${query ? `?${query}` : ""}`;
      if (handOff.current?.(href)) return;
      start(() => router.replace(href, { scroll: false }));
    };
    const onInput = (event: Event) => {
      if (!typed(event.target)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(go, 250);
    };
    const onChange = (event: Event) => {
      if (!typed(event.target)) go();
    };
    const onSubmit = (event: Event) => {
      event.preventDefault();
      go();
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    // typed before the page was ready (a slow phone, a quick hand): search for it now
    const early = Array.from(form.elements).some(
      (field) =>
        (field instanceof HTMLInputElement && field.type !== "hidden" && field.value !== field.defaultValue) ||
        (field instanceof HTMLSelectElement && !field.options[field.selectedIndex]?.defaultSelected && field.selectedIndex > 0),
    );
    if (early) timer = window.setTimeout(go, 0);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  }, [pathname, router]);

  // the address changed some other way (Clear, Back, a link): the boxes take what the page now says,
  // except the one being typed in. React keeps a box's typed value, so without this Clear left it filled.
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    for (const field of Array.from(form.elements)) {
      if (field === document.activeElement) continue;
      if (field instanceof HTMLSelectElement)
        field.value = (Array.from(field.options).find((option) => option.defaultSelected) ?? field.options[0])?.value ?? "";
      else if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) field.checked = field.defaultChecked;
      else if (field instanceof HTMLInputElement && field.type !== "hidden") field.value = field.defaultValue;
    }
  }, [params]);

  useEffect(() => {
    marker.current?.closest("form")?.toggleAttribute("data-pending", pending);
  }, [pending]);

  return <span ref={marker} hidden />;
}
