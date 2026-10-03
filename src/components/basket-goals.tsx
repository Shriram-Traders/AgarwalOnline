import { Check, PartyPopper, Target } from "lucide-react";
import type { BasketGoals as Goals } from "@/lib/commerce/goals";
import { formatPrice } from "@/lib/display";

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How far the basket is from free delivery and each shop offer, and what to add for the next one. */
export function BasketGoals({ goals, subtotalPaise }: { goals: Goals; subtotalPaise: number }) {
  if (!goals.milestones.length) return null;
  const done = !goals.next;
  return (
    <section className={`basket-goals${done ? " is-done" : ""}`} aria-label="Savings to unlock">
      <p className="basket-goals-headline">
        {done ? <PartyPopper size={18} aria-hidden="true" /> : <Target size={18} aria-hidden="true" />}
        {goals.headline}.
      </p>
      <div className="basket-goals-track">
        <progress
          value={Math.min(subtotalPaise, goals.maxPaise)}
          max={goals.maxPaise}
          aria-label={done ? goals.headline : `Progress towards ${goals.next?.label}`}
        />
        {goals.milestones.map((milestone) => (
          <span
            key={milestone.key}
            className={`goal-marker${milestone.reached ? " is-reached" : ""}`}
            style={{ left: `${(milestone.thresholdPaise / goals.maxPaise) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <ol className="basket-goals-list">
        {goals.milestones.map((milestone) => (
          <li key={milestone.key} className={milestone.reached ? "is-reached" : undefined}>
            {milestone.reached && <Check size={14} aria-hidden="true" />}
            <span>{capitalise(milestone.label)}</span>
            <small>{formatPrice(milestone.thresholdPaise)}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
