import { LayoutGrid, List } from "lucide-react";
import type { SchoolView } from "@/lib/schools/view";

/**
 * Photo cards or the bulk list. Plain links through /school/view, which remembers the choice
 * in this browser, so the catalogue opens the same way next time (no JavaScript needed).
 */
export function SchoolViewSwitch({ view, back }: { view: SchoolView; back: string }) {
  const href = (choice: SchoolView) => `/school/view?${new URLSearchParams({ v: choice, then: back })}`;
  return (
    <div className="view-switch" role="group" aria-label="Show products as">
      <a href={href("cards")} aria-current={view === "cards" ? "true" : undefined}>
        <LayoutGrid size={16} aria-hidden="true" /> Cards
      </a>
      <a href={href("list")} aria-current={view === "list" ? "true" : undefined}>
        <List size={16} aria-hidden="true" /> List
      </a>
    </div>
  );
}
