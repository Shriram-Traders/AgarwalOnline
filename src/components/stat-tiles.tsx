import Link from "next/link";
import type { ReactNode } from "react";

export type Stat = {
  label: string;
  value: ReactNode;
  /** Present on the linked "stats" variant, omitted on the read-only "cards" variant. */
  href?: string;
  /** A comparison line under the label, e.g. "Yesterday 4". */
  note?: string;
};

/**
 * The dashboard number row, written four separate times before this.
 *
 * "stats" renders `.governance-stats`, where the value leads and the label
 * follows. "cards" renders `.analytics-cards`, where the label leads. Both
 * orders are baked into the stylesheet, so the variant picks the markup rather
 * than the other way round.
 */
export function StatTiles({
  items,
  variant = "stats",
  className,
}: {
  items: Stat[];
  variant?: "stats" | "cards";
  /** Extra class, e.g. `account-stats` for the three-up customer row. */
  className?: string;
}) {
  const base = variant === "cards" ? "analytics-cards" : "governance-stats";
  return (
    <div className={className ? `${base} ${className}` : base}>
      {items.map((item) =>
        variant === "cards" ? (
          <article className="panel" key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </article>
        ) : item.href ? (
          // The value comes first visually, so spell the name out for screen
          // readers instead of letting it read "12 Awaiting confirmation".
          <Link href={item.href} key={item.label} aria-label={`${item.label}: ${item.value}`}>
            <span>{item.value}</span>
            <small>{item.label}</small>
            {item.note && <em>{item.note}</em>}
          </Link>
        ) : (
          <div key={item.label}>
            <span>{item.value}</span>
            <small>{item.label}</small>
            {item.note && <em>{item.note}</em>}
          </div>
        ),
      )}
    </div>
  );
}
