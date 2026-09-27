"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A native <details> dropdown that also closes on an outside tap or Escape. */
export function Popover({
  summary,
  label,
  className = "",
  children,
}: {
  summary: ReactNode;
  /** Accessible name when the summary is only an icon. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const menu = ref.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const menu = ref.current;
      // a confirm dialog inside the menu handles its own Escape
      if (event.key !== "Escape" || !menu?.open || menu.querySelector('[role="alertdialog"]')) return;
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={ref} className={`popover ${className}`}>
      <summary aria-label={label}>{summary}</summary>
      <div className="popover-panel">{children}</div>
    </details>
  );
}
