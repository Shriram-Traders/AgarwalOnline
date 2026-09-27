"use client";
import { startTransition, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { quickAddAction } from "@/lib/commerce/actions";
import { useBasket } from "./basket";

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
  const { lines, preview, commit } = useBasket();
  const [error, setError] = useState<string>();
  const qty = lines[variantId]?.quantity ?? 0;
  const limit = Math.min(max, available);

  function change(quantity: number) {
    const line = { variantId, quantity, pricePaise };
    startTransition(async () => {
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
