"use client";

import { useActionState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cartAction } from "@/lib/commerce/actions";

export function CartLineControls({
  variantId,
  quantity,
  max,
  name,
  action: save = cartAction,
  fields = {},
}: {
  variantId: string;
  quantity: number;
  max: number;
  name: string;
  /** The same stepper edits a shared list when given the list action and its hidden fields. */
  action?: typeof cartAction;
  fields?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(save, {});
  return (
    <form
      action={action}
      className="qty-stepper"
      data-pending={pending}
      aria-label={`Quantity for ${name}`}
    >
      <input type="hidden" name="variantId" value={variantId} />
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button
        name="quantity"
        value={quantity - 1}
        disabled={pending}
        aria-label={quantity === 1 ? `Remove ${name}` : "Decrease quantity"}
      >
        <Minus size={16} />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        name="quantity"
        value={quantity + 1}
        disabled={pending || quantity >= max}
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
      <button name="quantity" value={0} className="qty-remove" disabled={pending}>
        <Trash2 size={14} aria-hidden="true" /> Remove
      </button>
      {state.error && (
        <span role="alert" className="quick-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
