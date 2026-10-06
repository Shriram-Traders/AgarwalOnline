"use client";
import { useEffect } from "react";

const TYPING = "is-typing";
/**
 * How long the bars wait before coming back once typing stops. A tap on "Sign in" or "Send" moves
 * focus off the field first and only then clicks; bars that came back at once would slide under
 * the finger and take the tap.
 */
const RETURN_AFTER_MS = 400;

/** Anything that brings the on-screen keyboard up. */
function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "hidden"].includes(
    (target as HTMLInputElement).type,
  );
}

/**
 * Marks the page while a text field has focus (`html.is-typing`), so the bars pinned to the
 * bottom of a phone screen can step aside. Older phone browsers shrink the page to make room for
 * the keyboard, which lifts those bars over whatever is being typed into.
 */
export function KeyboardAware() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!isTextField(document.activeElement)) root.classList.remove(TYPING);
      }, RETURN_AFTER_MS);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isTextField(event.target)) return later();
      window.clearTimeout(timer);
      root.classList.add(TYPING);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", later);
      window.clearTimeout(timer);
      root.classList.remove(TYPING);
    };
  }, []);
  return null;
}
