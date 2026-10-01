import type { ReactNode } from "react";
import { displayStatus } from "@/lib/display";

/** Every pill rendered identically before this, so "Cancelled" looked like "Delivered". */
export type Tone = "neutral" | "ok" | "warn" | "bad";

const TONES: Record<string, Tone> = {
  delivered: "ok",
  completed: "ok",
  paid: "ok",
  resolved: "ok",
  reconciled: "ok",
  published: "ok",
  approved: "ok",
  active: "ok",
  placed: "warn",
  pending: "warn",
  picking: "warn",
  packed: "warn",
  ready: "warn",
  processing: "warn",
  open: "warn",
  "awaiting-review": "warn",
  // a delivery that didn't go through needs someone to decide what happens next
  attempted: "warn",
  cancelled: "bad",
  failed: "bad",
  returned: "bad",
  rejected: "bad",
  refunded: "bad",
  "partially-refunded": "bad",
  inactive: "bad",
};

/** Map a stored status value to a tone; unknown values stay neutral. */
export function toneFor(value: string): Tone {
  return TONES[value] ?? "neutral";
}

export function StatusPill({
  value,
  tone,
  children,
}: {
  /** The stored status value, e.g. "out-for-delivery". */
  value?: string;
  /** Override the inferred tone. */
  tone?: Tone;
  /** Custom label; defaults to the humanised status. */
  children?: ReactNode;
}) {
  const resolved = tone ?? (value ? toneFor(value) : "neutral");
  const className = resolved === "neutral" ? "status-pill" : `status-pill ${resolved}`;
  return <span className={className}>{children ?? (value ? displayStatus(value) : null)}</span>;
}

/**
 * The four-part order state row. It was four bare spans, so a screen reader
 * heard "Confirmed Picking Unassigned COD" with no idea which was which.
 */
export function StatusStrip({
  items,
}: {
  items: { label: string; value: string; tone?: Tone }[];
}) {
  return (
    <div className="status-strip">
      {items.map((item) => {
        const tone = item.tone ?? toneFor(item.value);
        return (
          <span
            className={tone === "neutral" ? undefined : tone}
            key={item.label}
          >
            <span className="sr-only">{item.label}: </span>
            {displayStatus(item.value)}
          </span>
        );
      })}
    </div>
  );
}
