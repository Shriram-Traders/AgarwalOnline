import { CalendarClock, MapPin, PlugZap, ReceiptText, ShieldCheck, Truck, WholeWord, TriangleAlert } from "lucide-react";
import { HighlightLink } from "@/components/hash-target";
import type { HubCard } from "@/lib/admin/settings-summary";

const ICONS = {
  "delivery-rules": Truck,
  weekly: CalendarClock,
  areas: MapPin,
  tax: ReceiptText,
  "stock-approval": ShieldCheck,
  synonyms: WholeWord,
  services: PlugZap,
} as const;

/** Store settings at a glance: one card per area with what it's set to now, and what needs fixing. */
export function SettingsHub({ cards }: { cards: HubCard[] }) {
  return (
    <section className="settings-hub-wrap" aria-labelledby="settings-hub-title">
      <h2 id="settings-hub-title" className="sr-only">
        Settings at a glance
      </h2>
      <ul className="settings-hub">
        {cards.map((card) => {
          const Icon = ICONS[card.id as keyof typeof ICONS] ?? Truck;
          return (
            <li key={card.id} className={`settings-hub-card${card.warnings.length ? " has-warning" : ""}`}>
              <h3>
                <Icon size={18} aria-hidden="true" />
                {card.title}
              </h3>
              <ul className="settings-hub-lines">
                {card.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {card.warnings.map((warning) => (
                <p key={warning} className="settings-hub-warning">
                  <TriangleAlert size={15} aria-hidden="true" />
                  {warning}
                </p>
              ))}
              <HighlightLink href={card.href} className="text-button">
                {card.edit}
                <span className="sr-only">: {card.title.toLowerCase()}</span>
              </HighlightLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
