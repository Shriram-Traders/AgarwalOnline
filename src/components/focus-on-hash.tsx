"use client";
import { useEffect } from "react";

/**
 * Moves focus to the element with this id (give it tabIndex={-1}) when the page opens at #id,
 * e.g. after an action lands there because the form that ran it is gone. Next scrolls to the
 * hash but leaves focus behind on the vanished button, so a screen reader said nothing and the
 * keyboard started again from the top. focus() also scrolls it into view if Next didn't.
 */
export function FocusOnHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.focus();
  }, [id]);
  return null;
}
