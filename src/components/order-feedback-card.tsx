"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { feedbackCopy } from "@/lib/feedback/copy";
import type { OwnFeedback } from "@/lib/feedback/service";
import type { Locale } from "@/lib/locale-types";
import { FeedbackSheet, type FeedbackOrder } from "./feedback-sheet";
import { StarInput } from "./star-input";
import { Stars } from "./stars";

/**
 * On a delivered order's page: the stars to rate it (opening the same sheet as the popup), or,
 * once rated, what the customer said and the shop's reply. Closing the sheet here isn't a
 * "Not now": the stars simply stay on the page.
 */
export function OrderFeedbackCard({
  order,
  locale,
  feedback,
}: {
  order: FeedbackOrder;
  locale: Locale;
  feedback: OwnFeedback | null;
}) {
  const text = feedbackCopy[locale];
  const router = useRouter();
  const [picked, setPicked] = useState<number | null>(null);
  const starLabels = text.starNames.map((name, index) => text.starLabel(index + 1, name));

  if (feedback)
    return (
      <section className="panel order-card feedback-card" id="feedback" tabIndex={-1} aria-labelledby="feedback-title" lang={locale}>
        <h2 id="feedback-title">{text.yourRating}</h2>
        <p className="feedback-given">
          <Stars rating={feedback.rating} label={text.ratedStars(feedback.rating)} />
          <span>{text.starNames[feedback.rating - 1]}</span>
        </p>
        {feedback.tags.length > 0 && (
          <ul className="feedback-tags">
            {feedback.tags.map((tag) => (
              <li key={tag}>{text.tags[tag]}</li>
            ))}
          </ul>
        )}
        {feedback.comment && <p className="feedback-comment">“{feedback.comment}”</p>}
        {feedback.riderRating && (
          <p className="feedback-rider">
            {text.riderRated}: <Stars rating={feedback.riderRating} label={text.ratedStars(feedback.riderRating)} />
          </p>
        )}
        {feedback.reply && (
          <div className="feedback-reply">
            <strong>{text.shopReply}</strong>
            <p>{feedback.reply.body}</p>
          </div>
        )}
      </section>
    );

  return (
    <section className="panel order-card feedback-card is-open" id="feedback" tabIndex={-1} aria-labelledby="feedback-title" lang={locale}>
      <h2 id="feedback-title">{text.cardTitle}</h2>
      <p className="muted">{text.cardLead}</p>
      <StarInput legend={text.starsLegend} hideLegend name="orderRating" value={picked} onChange={setPicked} labels={starLabels} />
      {picked !== null && (
        <FeedbackSheet
          order={order}
          locale={locale}
          initialRating={picked}
          onClose={(sent) => {
            setPicked(null);
            if (sent) router.refresh();
          }}
        />
      )}
    </section>
  );
}
