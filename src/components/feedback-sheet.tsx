"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { submitFeedbackAction, type FeedbackState } from "@/lib/feedback/actions";
import { feedbackCopy } from "@/lib/feedback/copy";
import { tagsFor, type FeedbackTag } from "@/lib/feedback/rules";
import type { Locale } from "@/lib/locale-types";
import { Modal } from "./modal";
import { PolicyNotice } from "./policy-notice";
import { safeAction } from "./safe-action";
import { StarInput } from "./star-input";

const send = safeAction<FeedbackState>(submitFeedbackAction);

export type FeedbackOrder = { orderId: string; number: string; hasRider: boolean };

/**
 * "How did we do?": the stars, then, once one is tapped, what was good or bad, the delivery
 * partner's stars and room for a line or two. A popup on a computer, a bottom sheet on a phone.
 * Nothing is saved until Send. `onClose` hears whether a rating went through.
 */
export function FeedbackSheet({
  order,
  locale,
  initialRating = null,
  onClose,
}: {
  order: FeedbackOrder;
  locale: Locale;
  initialRating?: number | null;
  onClose: (sent: boolean) => void;
}) {
  const text = feedbackCopy[locale];
  const [rating, setRating] = useState<number | null>(initialRating);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [riderRating, setRiderRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<FeedbackState>({});
  const [pending, startTransition] = useTransition();
  const sent = Boolean(result.success);
  const starLabels = text.starNames.map((name, index) => text.starLabel(index + 1, name));

  const rate = (stars: number) => {
    setRating(stars);
    // "On time" makes no sense under "What went wrong?": keep only what still applies
    setTags((chosen) => chosen.filter((tag) => tagsFor(stars).includes(tag)));
    setResult({});
  };
  const toggle = (tag: FeedbackTag) =>
    setTags((chosen) => (chosen.includes(tag) ? chosen.filter((item) => item !== tag) : [...chosen, tag]));
  const submit = () => {
    if (!rating) return setResult({ error: text.pickStarFirst });
    startTransition(async () => {
      const form = new FormData();
      form.set("orderId", order.orderId);
      form.set("rating", String(rating));
      for (const tag of tags) form.append("tags", tag);
      if (riderRating) form.set("riderRating", String(riderRating));
      form.set("comment", comment);
      const outcome = await send({}, form);
      startTransition(() => setResult(outcome));
    });
  };

  return (
    <Modal
      eyebrow={text.arrived(order.number)}
      title={sent ? text.thanksTitle : text.title}
      closeLabel={text.close}
      onClose={() => onClose(sent)}
    >
      {sent ? (
        <div className="feedback-sheet form-stack">
          <p role="status" className="success-message">
            {result.success}
          </p>
          {result.complaintType && (
            <div className="notice feedback-complaint">
              <p>{text.complaintLead}</p>
              <Link href={`/account/complaints?order=${order.orderId}&type=${result.complaintType}#report`}>
                {text.complaintLink}
              </Link>
            </div>
          )}
          <div className="split-actions feedback-actions">
            <button type="button" className="primary-button" onClick={() => onClose(true)}>
              {text.done}
            </button>
          </div>
        </div>
      ) : (
        <div className="feedback-sheet form-stack">
          <StarInput
            legend={text.starsLegend}
            hideLegend
            name="rating"
            value={rating}
            onChange={rate}
            labels={starLabels}
          />
          {rating ? (
            <>
              <p className="feedback-rated">{text.starNames[rating - 1]}</p>
              <div className="feedback-chips" role="group" aria-label={rating >= 4 ? text.liked : text.wrong}>
                <strong aria-hidden="true">{rating >= 4 ? text.liked : text.wrong}</strong>
                {tagsFor(rating).map((tag) => (
                  <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
                    {text.tags[tag]}
                  </button>
                ))}
              </div>
              {order.hasRider && (
                <StarInput
                  small
                  legend={text.rider}
                  name="riderRating"
                  value={riderRating}
                  onChange={setRiderRating}
                  labels={starLabels}
                />
              )}
              <label>
                <span>
                  {text.more} <small>{text.optional}</small>
                </span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={text.morePlaceholder}
                />
              </label>
              <PolicyNotice kind="feedback" locale={locale} />
            </>
          ) : (
            <p className="muted feedback-hint">{text.pickStar}</p>
          )}
          {result.error && (
            <p role="alert" className="error-message">
              {result.error}
            </p>
          )}
          <div className="split-actions feedback-actions">
            <button type="button" className="secondary-button" onClick={() => onClose(false)}>
              {text.notNow}
            </button>
            <button type="button" className="primary-button" disabled={pending} aria-busy={pending} onClick={submit}>
              {pending ? text.sending : text.send}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
