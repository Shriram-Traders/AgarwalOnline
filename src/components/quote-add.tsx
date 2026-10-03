import { schoolRepAction } from "@/lib/schools/actions";
import { ActionForm } from "./action-form";

/** Pack and quantity for the school's quote basket. Schools buy by the hundred, so it's a box, not a stepper. */
export function QuoteAdd({
  schoolId,
  name,
  packs,
}: {
  schoolId: string;
  name: string;
  packs: { id: string; label: string; price: string }[];
}) {
  const key = packs[0].id;
  return (
    <ActionForm action={schoolRepAction} submit="Add to quote" className="quote-add" buttonClassName="add-button">
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="schoolId" value={schoolId} />
      {packs.length > 1 ? (
        <label>
          <span className="sr-only">Pack of {name}</span>
          <select name="variantId" defaultValue={key}>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.label} · {pack.price}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="variantId" value={key} />
      )}
      <label>
        <span className="sr-only">How many of {name}</span>
        <input
          name="quantity"
          inputMode="numeric"
          pattern="[0-9]{1,6}"
          title="A whole number, like 500"
          placeholder="Qty"
          autoComplete="off"
          required
        />
      </label>
    </ActionForm>
  );
}
