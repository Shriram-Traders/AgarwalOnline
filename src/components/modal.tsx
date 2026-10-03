"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A popup that behaves like one: it takes focus, keeps Tab inside, and closes on Escape, the
 * close button or a tap outside. On phones it rises from the bottom like an app sheet.
 * Focus goes to the popup itself, not its first field, so a phone keyboard doesn't jump up
 * over it the moment it opens.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  closeLabel = "Close",
  initialFocus,
  variant = "sheet",
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Where focus starts instead of the popup itself, e.g. a search box that should take typing at once. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** "full" fills a phone screen, for search. */
  variant?: "sheet" | "full";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const first = useRef(initialFocus);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (first.current?.current ?? ref.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // a control inside used this Escape itself (a search box clearing its text)
        if (event.defaultPrevented) return;
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // the page behind shouldn't scroll under a finger that is scrolling the popup
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop sheet-backdrop" role="presentation" onMouseDown={() => close.current()}>
      <div
        ref={ref}
        className={`confirm-modal sheet-modal${variant === "full" ? " is-full" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label={closeLabel} onClick={() => close.current()}>
          <X size={20} aria-hidden="true" />
        </button>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
