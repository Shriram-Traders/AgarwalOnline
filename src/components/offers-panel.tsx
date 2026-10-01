import { BadgePercent, Check, TicketPercent } from "lucide-react";
import { ActionForm } from "./action-form";
import { applyPromotionAction, removePromotionAction } from "@/lib/promotions/actions";
import { offerSaving, type ShopOffer } from "@/lib/promotions/service";
import { formatIst, formatPrice } from "@/lib/display";

function condition(offer: ShopOffer) {
  const basket = offer.minimumSubtotalPaise
    ? `On baskets of ${formatPrice(offer.minimumSubtotalPaise)} or more`
    : "On any basket";
  const limit = offer.perCustomerLimit === 1 ? " · once per customer" : "";
  return `${basket}${limit} · till ${formatIst(offer.endsAt, { dateStyle: "medium" })}`;
}

function OfferAction({ offer }: { offer: ShopOffer }) {
  if (offer.state === "applied")
    return (
      <span className="offer-state is-applied">
        <Check size={16} aria-hidden="true" /> Applied
      </span>
    );
  if (offer.state === "used") return <span className="offer-state">Already used</span>;
  if (offer.state === "short")
    return <span className="offer-state">Add {formatPrice(offer.shortfallPaise)} more</span>;
  if (!offer.code) return <span className="offer-state">Used when it’s your best saving</span>;
  return (
    <ActionForm
      action={applyPromotionAction}
      submit="Apply"
      className="offer-apply"
      buttonClassName="secondary-button compact-button"
    >
      <input type="hidden" name="code" value={offer.code} />
    </ActionForm>
  );
}

/**
 * The basket's offers: a box to type a code at the top, then the shop's own offers to pick
 * from. One offer goes on an order, the biggest saving the basket qualifies for.
 */
export function OffersPanel({
  offers,
  applied,
  typedCode,
  codeIssue,
}: {
  offers: ShopOffer[];
  /** The offer on the basket now, with what it saves. */
  applied?: { name: string; code?: string; savePaise: number };
  /** The code the shopper typed earlier, if any. */
  typedCode?: string;
  /** Why the typed code isn't on the basket, when it isn't. */
  codeIssue?: string;
}) {
  const typedApplied = Boolean(typedCode && applied?.code === typedCode);
  return (
    <section className="panel offers-panel" id="offers" aria-labelledby="offers-title">
      <div className="offers-title">
        <TicketPercent size={20} aria-hidden="true" />
        <h2 id="offers-title">Offers &amp; coupons</h2>
      </div>
      <ActionForm action={applyPromotionAction} submit="Apply" className="promo-form">
        <label>
          Offer code
          <input
            name="code"
            defaultValue={typedCode}
            placeholder="Type a code, e.g. LOCAL10"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
          />
        </label>
      </ActionForm>
      {applied && (
        <div className="applied-offer" role="status">
          <Check size={18} aria-hidden="true" />
          <p>
            <strong>{applied.code ?? applied.name}</strong> applied · you save {formatPrice(applied.savePaise)}
          </p>
          {typedApplied && (
            <ActionForm action={removePromotionAction} submit="Remove" className="offer-remove" buttonClassName="text-button">
              {null}
            </ActionForm>
          )}
        </div>
      )}
      {typedCode && !typedApplied && (
        <div className="notice code-issue" role="status">
          <p>
            <strong>{typedCode}</strong> isn’t on this basket.{" "}
            {codeIssue ?? "A bigger saving is already applied; only one offer goes on an order."}
          </p>
          <ActionForm action={removePromotionAction} submit="Remove code" className="offer-remove" buttonClassName="text-button">
            {null}
          </ActionForm>
        </div>
      )}
      <div className="offers-list-heading">
        <h3>
          <BadgePercent size={16} aria-hidden="true" /> Offers from the shop
        </h3>
        <small className="muted">One offer per order: we always apply your biggest saving.</small>
      </div>
      {offers.length ? (
        <ul className="offer-list">
          {offers.map((offer) => (
            <li key={offer.id} className={`offer-card is-${offer.state}`}>
              <div className="offer-card-main">
                {offer.code ? (
                  <span className="offer-code">{offer.code}</span>
                ) : (
                  <span className="offer-auto">No code needed</span>
                )}
                <strong>{offerSaving(offer)}</strong>
                <small>{condition(offer)}</small>
              </div>
              <OfferAction offer={offer} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted offers-empty">No shop offers right now. Check back soon.</p>
      )}
    </section>
  );
}
