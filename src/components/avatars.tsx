/** The same person gets the same colour everywhere they appear, whether shown by full or first name. */
const tone = (name: string) => [...(name.trim().split(/\s+/)[0] ?? "")].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;

/** People as initials in overlapping circles; the first four. */
export function Avatars({ names, label, size = "md" }: { names: string[]; label?: string; size?: "sm" | "md" }) {
  return (
    <span className={`avatar-stack ${size}`} role={label ? "img" : undefined} aria-label={label}>
      {names.slice(0, 4).map((name, index) => (
        <span key={index} className={`avatar tone-${tone(name)}`} aria-hidden="true">
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      ))}
    </span>
  );
}
