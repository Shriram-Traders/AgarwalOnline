"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";
import { wishlistAction } from "@/lib/engagement/actions";

export function WishlistButton({
  productId,
  name,
  saved = false,
}: {
  productId: string;
  /** Product name, so a list of Save buttons reads as distinct controls to a screen reader. */
  name: string;
  saved?: boolean;
}) {
  const [state, action, pending] = useActionState(wishlistAction, { saved });
  return (
    <form action={action} className="wishlist-control">
      <input type="hidden" name="productId" value={productId} />
      <button
        aria-label={state.saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
        aria-pressed={state.saved}
        className={state.saved ? "saved" : ""}
        disabled={pending}
      >
        <Heart size={17} fill={state.saved ? "currentColor" : "none"} />
        <span>{pending ? "Saving…" : state.saved ? "Saved" : "Save"}</span>
      </button>
      {state.error && <small role="alert">{state.error}</small>}
    </form>
  );
}
