"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ListPlus } from "lucide-react";
import { listAction } from "@/lib/lists/actions";
import { Popover } from "./popover";
import { safeAction } from "./safe-action";

const saveToList = safeAction(listAction);

/** "Add to a different basket": one tap puts one of the chosen pack in a shared basket, or a new one. */
export function AddToList({
  variants,
  lists,
  mr,
}: {
  variants: { id: string; label: string; price: string }[];
  lists: { id: string; name: string }[];
  mr: boolean;
}) {
  const [state, action, pending] = useActionState(saveToList, {});
  const [variantId, setVariantId] = useState(variants[0].id);
  const [picked, setPicked] = useState<{ id?: string; name: string } | null>(null);
  const common = (
    <>
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="quantity" value="1" />
      <input type="hidden" name="variantId" value={variantId} />
    </>
  );
  return (
    <Popover
      className="add-to-list"
      summary={
        <>
          <ListPlus size={18} aria-hidden="true" />
          {mr ? "दुसऱ्या बास्केटमध्ये जोडा" : "Add to a different basket"}
        </>
      }
    >
      {variants.length > 1 && (
        <label>
          {mr ? "पॅक" : "Pack"}
          <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.price}
              </option>
            ))}
          </select>
        </label>
      )}
      {lists.length > 0 && (
        <form action={action} className="add-to-list-lists">
          {common}
          {lists.map((list) => (
            <button
              key={list.id}
              name="listId"
              value={list.id}
              disabled={pending}
              onClick={() => setPicked(list)}
            >
              {list.name}
            </button>
          ))}
        </form>
      )}
      <form
        action={action}
        className="add-to-list-new"
        onSubmit={(event) =>
          setPicked({ name: String(new FormData(event.currentTarget).get("name") ?? "") })
        }
      >
        {common}
        <label>
          {mr ? "नवीन बास्केट" : "New basket"}
          <input name="name" maxLength={60} required placeholder={mr ? "शाळेची यादी" : "School list"} />
        </label>
        <button className="secondary-button" disabled={pending}>
          {mr ? "बनवा आणि जोडा" : "Create & add"}
        </button>
      </form>
      {state.error && <p role="alert" className="error-message">{state.error}</p>}
      {state.success && picked && (
        <p role="status" className="success-message">
          {mr ? `“${picked.name}” मध्ये जोडले.` : `Added to ${picked.name}.`}{" "}
          <Link href={picked.id ? `/cart?basket=${picked.id}` : "/cart"}>
            {mr ? "बास्केट पाहा" : "View basket"}
          </Link>
        </p>
      )}
    </Popover>
  );
}
