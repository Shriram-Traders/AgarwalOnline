import type { ReactNode } from "react";

/** A titled list of counts, each with a bar showing its share of the largest. */
export function MetricList({
  title,
  rows,
  empty = "No data in this period.",
}: {
  title: string;
  /** Label, the number the bar is drawn from, and optionally what to show instead of that number. */
  rows: Array<[label: string, value: number, shown?: ReactNode]>;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return (
    <article className="panel metric-list">
      <h2>{title}</h2>
      {rows.length ? (
        rows.map(([label, value, shown]) => (
          <div key={label}>
            <span>{label.replaceAll("-", " ")}</span>
            <strong>{shown ?? value}</strong>
            <i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
          </div>
        ))
      ) : (
        <p className="muted">{empty}</p>
      )}
    </article>
  );
}
