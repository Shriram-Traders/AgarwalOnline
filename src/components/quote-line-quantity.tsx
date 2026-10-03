"use client";
import { useActionState, useMemo, useState } from "react";
import { schoolRepAction } from "@/lib/schools/actions";
import { safeAction } from "./safe-action";
import { useUnsaved } from "./send-when-saved";

/** A basket line's quantity: Save shows once it changes, and sending waits until it's saved. */
export function QuoteLineQuantity({
  schoolId,
  variantId,
  quantity,
  name,
}: {
  schoolId: string;
  variantId: string;
  quantity: number;
  name: string;
}) {
  const action = useMemo(() => safeAction(schoolRepAction), []);
  const [state, dispatch, pending] = useActionState(action, {});
  const [value, setValue] = useState(String(quantity));
  const [shown, setShown] = useState(quantity);
  // a save, or someone else at the school changing it, brings a new saved quantity
  if (shown !== quantity) {
    setShown(quantity);
    setValue(String(quantity));
  }
  const dirty = value.trim() !== String(quantity);
  useUnsaved(`qty-${variantId}`, dirty);
  const id = `qty-${variantId}`;
  return (
    <form action={dispatch} className="quote-qty" onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="intent" value="set" />
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="variantId" value={variantId} />
      <label className="sr-only" htmlFor={id}>
        Quantity of {name}
      </label>
      <input
        id={id}
        name="quantity"
        inputMode="numeric"
        pattern="[0-9]{1,6}"
        title="A whole number, like 500"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
      />
      {dirty && (
        <button className="primary-button compact-button" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      )}
      {state.error && (
        <p role="alert" className="error-message">
          {state.error}
        </p>
      )}
    </form>
  );
}
