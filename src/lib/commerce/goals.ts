import { formatPrice } from "../display";

/*
 * The basket's goal bar: free delivery and each shop offer with a minimum basket, in the order
 * a growing basket reaches them, and a headline for the next one. Pure, so it can be tested
 * on its own; the basket page passes in the live rules and offers.
 */

export type Milestone = { key: string; label: string; thresholdPaise: number; reached: boolean };
export type GoalOffer = {
  id: string;
  /** "10% off", as shoppers read it. */
  saving: string;
  code?: string;
  name: string;
  minimumSubtotalPaise: number;
  state: "applied" | "ready" | "short" | "used";
};
export type BasketGoals = {
  milestones: Milestone[];
  next?: Milestone;
  /** "Add ₹159 more for 10% off (LOCAL10)". */
  headline: string;
  /** The bar's full length: the biggest milestone shown. */
  maxPaise: number;
};

const MAX_MILESTONES = 4;

export function basketGoals(subtotalPaise: number, freeThresholdPaise: number, offers: GoalOffer[]): BasketGoals {
  const milestones: Milestone[] = [
    ...(freeThresholdPaise > 0
      ? [{ key: "delivery", label: "free delivery", thresholdPaise: freeThresholdPaise, reached: false }]
      : []),
    // an offer this shopper has used up can't be unlocked, and one with no minimum isn't a goal
    ...offers
      .filter((offer) => offer.state !== "used" && offer.minimumSubtotalPaise > 0)
      .map((offer) => ({
        key: offer.id,
        label: `${offer.saving} (${offer.code ?? offer.name})`,
        thresholdPaise: offer.minimumSubtotalPaise,
        reached: false,
      })),
  ]
    .sort((a, b) => a.thresholdPaise - b.thresholdPaise)
    .slice(0, MAX_MILESTONES)
    .map((milestone) => ({ ...milestone, reached: subtotalPaise >= milestone.thresholdPaise }));
  const next = milestones.find((milestone) => !milestone.reached);
  const offersShown = milestones.some((milestone) => milestone.key !== "delivery");
  const headline = next
    ? `Add ${formatPrice(next.thresholdPaise - subtotalPaise)} more for ${next.label}`
    : !milestones.length
      ? ""
      : freeThresholdPaise > 0
        ? offersShown
          ? "You’ve unlocked free delivery and every offer"
          : "You’ve unlocked free delivery"
        : "You’ve unlocked every offer";
  return { milestones, next, headline, maxPaise: milestones.at(-1)?.thresholdPaise ?? 0 };
}
