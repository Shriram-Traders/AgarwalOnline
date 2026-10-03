import { offerSaving, type ShopOffer } from "@/lib/promotions/service";
import { formatIst, formatPrice } from "@/lib/display";
import { CouponPopup, type CouponCard } from "./coupon-popup";

function condition(offer: ShopOffer) {
  const basket = offer.minimumSubtotalPaise
    ? `On baskets of ${formatPrice(offer.minimumSubtotalPaise)} or more`
    : "On any basket";
  const limit = offer.perCustomerLimit === 1 ? " · once per customer" : "";
  return `${basket}${limit} · till ${formatIst(offer.endsAt, { dateStyle: "medium" })}`;
}

/**
 * The basket's and checkout's coupons, folded into one line: what's applied (or how many
 * offers there are), and a popup with a box for any code plus the shop's own offers. One
 * offer goes on an order, the biggest saving the basket qualifies for.
 */
export function CouponPicker({
  offers,
  applied,
  typedCode,
  codeIssue,
  compact = false,
}: {
  offers: ShopOffer[];
  /** The offer on the basket now, with what it saves. */
  applied?: { name: string; code?: string; savePaise: number };
  /** The code the shopper typed earlier, if any. */
  typedCode?: string;
  /** Why the typed code isn't on the basket, when it isn't. */
  codeIssue?: string;
  /** The narrower checkout summary. */
  compact?: boolean;
}) {
  const typedApplied = Boolean(typedCode && applied?.code === typedCode);
  const ready = offers.filter((offer) => offer.state === "ready").length;
  const shortfalls = offers.filter((offer) => offer.state === "short").map((offer) => offer.shortfallPaise);
  const line = applied
    ? `You save ${formatPrice(applied.savePaise)} · View all coupons`
    : ready
      ? `${ready} ${ready === 1 ? "offer" : "offers"} available`
      : shortfalls.length
        ? `Add ${formatPrice(Math.min(...shortfalls))} more to unlock an offer`
        : "Have a code? Enter it here";
  const cards: CouponCard[] = offers.map((offer) => ({
    id: offer.id,
    code: offer.code,
    saving: offerSaving(offer),
    condition: condition(offer),
    state: offer.state,
    shortfall: offer.state === "short" ? formatPrice(offer.shortfallPaise) : undefined,
  }));
  return (
    <CouponPopup
      cards={cards}
      title={applied ? `${applied.code ?? applied.name} applied` : "Apply a coupon"}
      line={line}
      applied={Boolean(applied)}
      removable={typedApplied}
      issue={
        typedCode && !typedApplied
          ? `${typedCode} isn’t on this basket. ${codeIssue ?? "A bigger saving is already applied; only one offer goes on an order."}`
          : undefined
      }
      typedCode={typedApplied ? undefined : typedCode}
      compact={compact}
    />
  );
}
