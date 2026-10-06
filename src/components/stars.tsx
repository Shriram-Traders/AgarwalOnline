/** Five stars as text, with the number for screen readers. */
export function Stars({ rating, label }: { rating: number; label?: string }) {
  return (
    <span className="review-stars">
      <span aria-hidden="true">
        {"★".repeat(rating)}
        {"☆".repeat(5 - rating)}
      </span>
      <span className="sr-only">{label ?? `${rating} of 5`}</span>
    </span>
  );
}
