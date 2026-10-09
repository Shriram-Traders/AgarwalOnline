"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { reviewAction } from "@/lib/reviews/actions";

/** One tap rates a delivered product; words can follow on the product page. */
export function RateStars({
  productId,
  slug,
  name,
  rating = 0,
}: {
  productId: string;
  slug: string;
  name: string;
  rating?: number;
}) {
  const [state, action, pending] = useActionState(reviewAction, {});
  const [picked, setPicked] = useState(rating);
  return (
    <form action={action} className="rate-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <div role="group" aria-label={`Rate ${name}`} className="rate-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            name="rating"
            value={n}
            aria-label={`Rate ${n} out of 5`}
            aria-pressed={picked === n}
            className={n <= picked ? "on" : undefined}
            disabled={pending}
            onClick={() => setPicked(n)}
          >
            <Star size={26} fill={n <= picked ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        ))}
      </div>
      {state.success && (
        <p role="status" className="rate-thanks">
          {state.success} <Link href={`/products/${slug}#reviews`}>Add a few words</Link>
        </p>
      )}
      {state.error && (
        <p role="alert" className="error-message">
          {state.error}
        </p>
      )}
    </form>
  );
}
