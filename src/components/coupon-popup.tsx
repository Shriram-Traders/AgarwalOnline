"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CircleCheck, Lock, TicketPercent } from "lucide-react";
import type { MutationState } from "@/lib/commerce/actions";
import { applyPromotionAction, removePromotionAction } from "@/lib/promotions/actions";
import { Modal } from "./modal";
import { safeAction } from "./safe-action";

/** A shop offer, already put into words on the server. */
export type CouponCard = {
  id: string;
  code?: string;
  saving: string;
  condition: string;
  state: "applied" | "ready" | "short" | "used";
  /** "₹260", for an offer the basket is too small for. */
  shortfall?: string;
};

const applyCode = safeAction(applyPromotionAction);
const removeCode = safeAction(removePromotionAction);

/*
 * No <form> of its own anywhere in here: at checkout this sits inside the order form, where a
 * nested form is invalid HTML and Enter in the code box would place the order. Buttons call
 * the coupon actions directly instead, and the page refreshes with the new totals.
 */

/** The one-line preview, and the "Coupons" popup it opens (a bottom sheet on phones). */
export function CouponPopup({
  cards,
  title,
  line,
  applied,
  removable,
  issue,
  typedCode,
  compact,
}: {
  cards: CouponCard[];
  title: string;
  line: string;
  applied: boolean;
  removable: boolean;
  issue?: string;
  typedCode?: string;
  compact: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  const close = useCallback(() => setOpen(false), []);
  const remove = () =>
    startRemoving(async () => {
      const result = await removeCode({}, new FormData());
      startRemoving(() => {
        setRemoveError(result.error);
        if (!result.error) router.refresh();
      });
    });
  const removeButton = (label: string) => (
    <button type="button" className="text-button coupon-remove" onClick={remove} disabled={removing} aria-busy={removing}>
      {removing ? "Removing…" : label}
    </button>
  );
  return (
    <section
      id="offers"
      className={`coupon-preview${applied ? " is-applied" : ""}${compact ? " is-compact" : ""}`}
      aria-label="Offers and coupons"
    >
      <div className="coupon-row">
        <button type="button" className="coupon-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span className="coupon-icon" aria-hidden="true">
            {applied ? <CircleCheck size={20} /> : <TicketPercent size={20} />}
          </span>
          <span className="coupon-text">
            <strong>{title}</strong>
            <small>{line}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {removable && removeButton("Remove")}
      </div>
      {issue && (
        <div className="notice code-issue" role="status">
          <p>{issue}</p>
          {removeButton("Remove code")}
        </div>
      )}
      {removeError && (
        <p role="alert" className="error-message">
          {removeError}
        </p>
      )}
      {open && (
        <Modal title="Coupons" onClose={close}>
          <CouponSheet cards={cards} typedCode={typedCode} onApplied={close} />
        </Modal>
      )}
    </section>
  );
}

/**
 * The popup's contents. It mounts each time the popup opens, so an old message never shows
 * again; a code that goes on the basket closes the popup and the preview shows the saving.
 */
function CouponSheet({
  cards,
  typedCode,
  onApplied,
}: {
  cards: CouponCard[];
  typedCode?: string;
  onApplied: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(typedCode ?? "");
  const [result, setResult] = useState<MutationState>({});
  const [pending, startTransition] = useTransition();
  const apply = (value: string) =>
    startTransition(async () => {
      const form = new FormData();
      form.set("code", value);
      const outcome = await applyCode({}, form);
      startTransition(() => {
        setResult(outcome);
        if (outcome.success) {
          onApplied();
          router.refresh();
        }
      });
    });
  const available = cards.filter((card) => card.state === "applied" || card.state === "ready");
  const locked = cards.filter((card) => card.state === "short");
  const used = cards.filter((card) => card.state === "used");
  const group = (heading: string, list: CouponCard[]) =>
    list.length > 0 && (
      <section className="coupon-group" aria-label={heading}>
        <h3>{heading}</h3>
        <ul className="offer-list">
          {list.map((card) => (
            <li key={card.id} className={`offer-card is-${card.state}`}>
              <div className="offer-card-main">
                {card.code ? <span className="offer-code">{card.code}</span> : <span className="offer-auto">No code needed</span>}
                <strong>{card.saving}</strong>
                <small>{card.condition}</small>
              </div>
              {card.state === "applied" ? (
                <span className="offer-state is-applied">
                  <Check size={16} aria-hidden="true" /> Applied
                </span>
              ) : card.state === "used" ? (
                <span className="offer-state">Already used</span>
              ) : card.state === "short" ? (
                <span className="offer-state">
                  <Lock size={14} aria-hidden="true" /> Add {card.shortfall} more
                </span>
              ) : !card.code ? (
                <span className="offer-state">Used when it’s your best saving</span>
              ) : (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  disabled={pending}
                  onClick={() => apply(card.code!)}
                >
                  Apply
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="coupon-sheet">
      <div className="promo-form coupon-entry">
        <label>
          Enter a coupon code
          <input
            name="coupon"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // never let Enter reach the checkout form around this
              event.preventDefault();
              if (code.trim() && !pending) apply(code);
            }}
            placeholder="e.g. LOCAL10"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            enterKeyHint="go"
          />
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={pending || !code.trim()}
          aria-busy={pending}
          onClick={() => apply(code)}
        >
          {pending ? "Please wait…" : "Apply"}
        </button>
        {result.error && (
          <p role="alert" className="error-message">
            {result.error}
          </p>
        )}
      </div>
      {group("Available for this basket", available)}
      {group("Add more to unlock", locked)}
      {group("Already used", used)}
      {!cards.length && <p className="muted">No shop offers right now. A code you were given still works above.</p>}
      <p className="muted coupon-rule">One offer per order: we always apply your biggest saving.</p>
    </div>
  );
}
