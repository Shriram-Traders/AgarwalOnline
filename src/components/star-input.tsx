"use client";
import { Fragment, useId, useState } from "react";
import { Star } from "lucide-react";

/**
 * Five stars to tap. Underneath they are ordinary radio buttons, so arrow keys move between
 * them and a screen reader announces "4 stars – Good, radio button, 4 of 5".
 */
export function StarInput({
  legend,
  name,
  value,
  onChange,
  labels,
  hideLegend = false,
  small = false,
}: {
  legend: string;
  name: string;
  value: number | null;
  onChange: (stars: number) => void;
  /** The spoken name of each star, 1 to 5. */
  labels: string[];
  hideLegend?: boolean;
  small?: boolean;
}) {
  const id = useId();
  // a mouse lights the stars up to the one it's over; a tap or a key just picks
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? value ?? 0;
  return (
    <fieldset className={`star-input${small ? " is-small" : ""}`}>
      <legend className={hideLegend ? "sr-only" : undefined}>{legend}</legend>
      <div className="star-row" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <Fragment key={stars}>
            <input
              className="sr-only"
              type="radio"
              id={`${id}-${stars}`}
              name={name}
              value={stars}
              checked={value === stars}
              onChange={() => onChange(stars)}
            />
            <label
              htmlFor={`${id}-${stars}`}
              className={stars <= lit ? "is-on" : undefined}
              title={labels[stars - 1]}
              onMouseEnter={() => setHover(stars)}
            >
              <Star size={small ? 24 : 32} aria-hidden="true" fill={stars <= lit ? "currentColor" : "none"} />
              <span className="sr-only">{labels[stars - 1]}</span>
            </label>
          </Fragment>
        ))}
      </div>
    </fieldset>
  );
}
