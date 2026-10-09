"use client";
import { startTransition, useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { quickAddAction } from "@/lib/commerce/actions";
import { useBasket } from "./basket";

/**
 * One pack's line in the basket: how many are in it, and a change that shows at once and is
 * saved behind it, rolling back if the store refuses (too many, sold out, connection lost).
 */
function useBasketLine(variantId: string, pricePaise: number) {
  const { lines, preview, commit } = useBasket();
  const [error, setError] = useState<string>();
  // true until the store has the last change: the number shows at once, the save follows
  const [saving, start] = useTransition();
  const qty = lines[variantId]?.quantity ?? 0;

  function change(quantity: number) {
    const line = { variantId, quantity, pricePaise };
    start(async () => {
      preview(line);
      const form = new FormData();
      form.set("variantId", variantId);
      form.set("quantity", String(quantity));
      const result = await quickAddAction({}, form).catch(() => ({
        error: "Could not reach the store. Check your connection and try again.",
      }));
      startTransition(() => {
        setError(result.error);
        if (!result.error) commit(line);
      });
    });
  }
  return { qty, change, error, saving };
}

/** Quick-commerce ADD that becomes a stepper on tap; the save runs behind it and rolls back if refused. */
export function QuickAdd({
  variantId,
  pricePaise,
  available,
  max,
  name,
}: {
  variantId: string;
  pricePaise: number;
  available: number;
  max: number;
  name: string;
}) {
  const { qty, change, error } = useBasketLine(variantId, pricePaise);
  const limit = Math.min(max, available);

  return (
    <div className="quick-add">
      {qty === 0 ? (
        <button
          type="button"
          className="add-button"
          disabled={available === 0}
          onClick={() => change(1)}
          aria-label={available ? `Add ${name} to basket` : `${name} is out of stock`}
        >
          {available ? "Add" : "Sold out"}
        </button>
      ) : (
        <span className="qty-stepper compact" aria-label={`Quantity of ${name} in basket`}>
          <button
            type="button"
            onClick={() => change(qty - 1)}
            aria-label={qty === 1 ? `Remove ${name} from basket` : "Decrease quantity"}
          >
            <Minus size={16} />
          </button>
          <output aria-live="polite">{qty}</output>
          <button
            type="button"
            onClick={() => change(qty + 1)}
            disabled={qty >= limit}
            aria-label="Increase quantity"
          >
            <Plus size={16} />
          </button>
        </span>
      )}
      {error && (
        <span role="alert" className="quick-error">
          {error}
        </span>
      )}
    </div>
  );
}

const PRODUCT_WORDS = {
  en: {
    add: "Add to basket",
    soldOut: "Sold out",
    inBasket: (n: number) => `${n} in basket`,
    less: (name: string, n: number) => (n === 1 ? `Remove ${name} from basket` : `One fewer ${name}`),
    more: (name: string) => `One more ${name}`,
    most: (n: number) => `That’s the most for one order (${n}).`,
    basket: "View basket",
  },
  mr: {
    add: "बास्केटमध्ये टाका",
    soldOut: "संपले",
    inBasket: (n: number) => `बास्केटमध्ये ${n}`,
    less: (name: string, n: number) => (n === 1 ? `${name} बास्केटमधून काढा` : `${name} एक कमी`),
    more: (name: string) => `${name} आणखी एक`,
    most: (n: number) => `एका ऑर्डरमध्ये जास्तीत जास्त ${n}.`,
    basket: "बास्केट पाहा",
  },
};

/**
 * The product page's buying control: "Add to basket", which becomes − "3 in basket" + once the
 * pack is in the basket, so tapping again adds one more instead of starting over at the typed number.
 */
export function ProductQuantity({
  variantId,
  pricePaise,
  available,
  max,
  name,
  mr = false,
}: {
  variantId: string;
  pricePaise: number;
  available: number;
  max: number;
  name: string;
  mr?: boolean;
}) {
  const words = PRODUCT_WORDS[mr ? "mr" : "en"];
  const { qty, change, error, saving } = useBasketLine(variantId, pricePaise);
  const limit = Math.min(max, available);
  return (
    <div className="product-quantity" aria-busy={saving}>
      {qty === 0 ? (
        <button type="button" className="primary-button product-add" disabled={available === 0} onClick={() => change(1)}>
          <ShoppingBag size={18} aria-hidden="true" />
          {available ? words.add : words.soldOut}
        </button>
      ) : (
        <>
          <span className="qty-stepper product-stepper">
            <button type="button" onClick={() => change(qty - 1)} aria-label={words.less(name, qty)}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <output aria-live="polite">{words.inBasket(qty)}</output>
            <button type="button" onClick={() => change(qty + 1)} disabled={qty >= limit} aria-label={words.more(name)}>
              <Plus size={18} aria-hidden="true" />
            </button>
          </span>
          <Link href="/cart" className="product-basket-link">
            {words.basket}
          </Link>
          {qty >= limit && limit > 0 && <small className="muted product-limit">{words.most(limit)}</small>}
        </>
      )}
      {error && (
        <span role="alert" className="error-message">
          {error}
        </span>
      )}
    </div>
  );
}
