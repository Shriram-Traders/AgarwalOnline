"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, Heart } from "lucide-react";
import { listAction } from "@/lib/lists/actions";
import { Popover } from "./popover";
import { safeAction } from "./safe-action";

const saveToBoard = safeAction(listAction);

/** A product page's Save: the heart plus "Save to…" a board, or a new one. */
export function SaveToBoard({
  productId,
  variantId,
  saved,
  boards,
  mr,
}: {
  productId: string;
  variantId: string;
  saved: boolean;
  boards: { id: string; name: string; has: boolean }[];
  mr: boolean;
}) {
  const [state, action, pending] = useActionState(saveToBoard, {});
  const common = (
    <>
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
    </>
  );
  return (
    <Popover
      className="save-menu"
      summary={
        <>
          <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          {saved ? (mr ? "जतन केले" : "Saved") : mr ? "जतन करा" : "Save"}
        </>
      }
    >
      <p className="popover-title">{mr ? "येथे जतन करा…" : "Save to…"}</p>
      <form action={action} className="save-menu-rows">
        {common}
        <button name="board" value="saved" aria-pressed={saved} disabled={pending}>
          <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          <span>{mr ? "जतन केलेले" : "Saved"}</span>
          {saved && <Check size={18} aria-hidden="true" />}
        </button>
        {boards.map((board) =>
          board.has ? (
            <Link key={board.id} href={`/account/lists/${board.id}`} className="save-menu-on">
              <span>{board.name}</span>
              <Check size={18} aria-label={mr ? "येथे आहे" : "On this board"} />
            </Link>
          ) : (
            <button key={board.id} name="board" value={board.id} disabled={pending}>
              <span>{board.name}</span>
            </button>
          ),
        )}
      </form>
      <form action={action} className="add-to-list-new">
        {common}
        <label>
          {mr ? "नवीन बोर्ड" : "New board"}
          <input name="name" maxLength={60} required placeholder={mr ? "दिवाळी भेटी" : "Diwali gifts"} />
        </label>
        <button className="secondary-button" disabled={pending}>
          {mr ? "जतन करा" : "Save"}
        </button>
      </form>
      {state.error && <p role="alert" className="error-message">{state.error}</p>}
      {state.success && <p role="status" className="success-message">{state.success}</p>}
    </Popover>
  );
}
