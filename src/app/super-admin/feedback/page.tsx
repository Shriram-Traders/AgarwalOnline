import Link from "next/link";
import { MessageSquareHeart, MessageSquareReply, Phone, Sparkles } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { FEEDBACK_PERMISSION } from "@/lib/feedback/access";
import { feedbackCopy } from "@/lib/feedback/copy";
import { LOW_RATING } from "@/lib/feedback/rules";
import {
  feedbackBoard,
  feedbackCard,
  listFeedback,
  PERIODS,
  type FeedbackCard,
  type FeedbackTab,
  type Period,
} from "@/lib/feedback/service";
import { feedbackReadAction, replyFeedbackAction } from "@/lib/feedback/actions";
import { reviewForOwner, reviewsForOwner, type OwnerReview } from "@/lib/reviews/service";
import { moderateReviewAction } from "@/lib/reviews/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FocusOnHash } from "@/components/focus-on-hash";
import { MetricList } from "@/components/metric-list";
import { PageHeading } from "@/components/page-heading";
import { Stars } from "@/components/stars";
import { StatTiles } from "@/components/stat-tiles";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { formatPrice } from "@/lib/display";
export const metadata = { title: "Ratings & feedback", robots: { index: false } };

type Tab = FeedbackTab | "reviews";
const TABS: Tab[] = ["attention", "unread", "all", "reviews"];
type Params = { tab?: string; q?: string; rating?: string; period?: string; page?: string; reply?: string; review?: string };
const tagName = feedbackCopy.en.tags;

/** What a customer said about one order: shared by the reading cards and the reply panel. */
function Said({ card }: { card: FeedbackCard }) {
  return (
    <>
      {card.tags.length > 0 && (
        <ul className="feedback-tags">
          {card.tags.map((tag) => (
            <li key={tag}>{tagName[tag]}</li>
          ))}
        </ul>
      )}
      {card.comment ? <p className="feedback-comment">“{card.comment}”</p> : <p className="muted">No comment.</p>}
      {card.riderRating && (
        <p className="feedback-rider">
          Delivery partner{card.riderName ? ` ${card.riderName}` : ""}: <Stars rating={card.riderRating} />
        </p>
      )}
    </>
  );
}

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requirePage(FEEDBACK_PERMISSION);
  const params = await searchParams;
  const tab: Tab = TABS.find((value) => value === params.tab) ?? "all";
  const period: Period = PERIODS.find((days) => String(days) === params.period) ?? (params.period === "all" ? "all" : 30);
  const rating = [1, 2, 3, 4, 5].find((stars) => String(stars) === params.rating);
  const term = params.q?.trim().slice(0, 80) || undefined;
  const page = Number(params.page) || 1;

  const [board, list, reviews] = await Promise.all([
    feedbackBoard(user.id, period),
    tab === "reviews" ? null : listFeedback(user.id, { tab, q: term, rating, period, page }),
    tab === "reviews" ? reviewsForOwner(user.id, { q: term, rating, page }) : null,
  ]);
  const replying = params.reply
    ? (list?.cards.find((card) => card.id === params.reply) ?? (await feedbackCard(user.id, params.reply)))
    : null;
  const moderating = params.review
    ? (reviews?.rows.find((review) => review.id === params.review) ?? (await reviewForOwner(params.review)))
    : null;

  /** A link within this page that keeps the tab and filters; page, reply and review only when asked for. */
  const href = (change: Partial<Record<keyof Params, string | number | undefined>> = {}, hash = "") => {
    const next = { tab, q: term, rating: rating ? String(rating) : undefined, period: String(period), ...change };
    const query = new URLSearchParams(
      Object.entries(next)
        .filter(
          ([key, value]) =>
            value !== undefined &&
            value !== "" &&
            // the defaults stay out of the address
            !(key === "tab" && value === "all") &&
            !(key === "period" && value === "30") &&
            !(key === "page" && Number(value) <= 1),
        )
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return `/super-admin/feedback${query ? `?${query}` : ""}${hash}`;
  };
  const shown = list ?? reviews!;
  const filtered = Boolean(term || rating);
  const periodWords = period === "all" ? "All time" : `Last ${period} days`;
  const noun = (count: number, one: string, many: string) => (count === 1 ? one : many);

  return (
    <section className="page-container feedback-page">
      <PageHeading
        eyebrow="Owner"
        title="Ratings & feedback"
        lead="What customers said about their orders after delivery. Only the shop sees these; product reviews are the public ones."
      />

      <StatTiles
        items={[
          { label: "Average rating", value: board.count ? `${board.average.toFixed(1)} ★` : "–", note: periodWords },
          { label: "Ratings received", value: board.count, note: periodWords },
          { label: "Needs attention", value: board.attention, href: href({ tab: "attention" }), note: "1–2 stars, not read yet" },
          { label: "With a comment", value: board.commented, note: periodWords },
        ]}
      />
      <div className="analytics-grid feedback-board">
        <MetricList
          title="Stars"
          empty="No ratings in this period."
          rows={board.count ? board.stars.map((count, index) => [`${5 - index} ${noun(5 - index, "star", "stars")}`, count]) : []}
        />
        <MetricList
          title="What customers say"
          empty="No tags picked in this period."
          rows={board.tags.map(({ tag, count }) => [tagName[tag], count])}
        />
        <MetricList
          title="Delivery partners"
          empty="No delivery partner rated in this period."
          rows={board.riders.map((rider) => [
            rider.name,
            rider.average,
            `${rider.average.toFixed(1)} ★ · ${rider.count} ${noun(rider.count, "rating", "ratings")}`,
          ])}
        />
      </div>

      {replying && (
        <div className="panel adjust-panel" id="reply" tabIndex={-1}>
          <FocusOnHash id="reply" />
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                Order {replying.orderNumber} · <When at={replying.submittedAt} />
              </span>
              <h2>
                {replying.customer} gave <Stars rating={replying.rating} />
              </h2>
            </div>
            <Link href={href({ page: list?.page })} className="text-button">
              Close
            </Link>
          </div>
          <Said card={replying} />
          {replying.reply ? (
            <div className="feedback-reply">
              <strong>
                Your reply · <When at={replying.reply.at} />
              </strong>
              <p>{replying.reply.body}</p>
            </div>
          ) : (
            <ActionForm
              action={replyFeedbackAction}
              submit="Send reply"
              confirmMessage="The customer is notified and sees this on their order page. A reply can’t be changed or taken back."
            >
              <input type="hidden" name="feedbackId" value={replying.id} />
              <label>
                Your reply to the customer
                <textarea name="reply" rows={4} minLength={5} maxLength={1000} required />
              </label>
            </ActionForm>
          )}
        </div>
      )}
      {moderating && (
        <div className="panel adjust-panel" id="review" tabIndex={-1}>
          <FocusOnHash id="review" />
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                Product review · <When at={moderating.createdAt} />
              </span>
              <h2>{moderating.product}</h2>
            </div>
            <Link href={href({ page: reviews?.page })} className="text-button">
              Close
            </Link>
          </div>
          <ReviewBody review={moderating} />
          <ActionForm
            action={moderateReviewAction}
            submit={moderating.status === "hidden" ? "Show review again" : "Hide review"}
            confirmMessage={
              moderating.status === "hidden"
                ? "Shoppers will see this review on the product page again."
                : "Shoppers will no longer see this review on the product page."
            }
          >
            <input type="hidden" name="reviewId" value={moderating.id} />
            <input type="hidden" name="status" value={moderating.status === "hidden" ? "published" : "hidden"} />
            <label>
              Why <small>kept in the audit trail</small>
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
          </ActionForm>
        </div>
      )}

      <nav className="catalog-chips feedback-tabs" aria-label="Feedback lists">
        <Link href={href({ tab: "attention" })} aria-current={tab === "attention" ? "page" : undefined}>
          Needs attention ({board.attention})
        </Link>
        <Link href={href({ tab: "unread" })} aria-current={tab === "unread" ? "page" : undefined}>
          Unread ({board.unread})
        </Link>
        <Link href={href({ tab: "all" })} aria-current={tab === "all" ? "page" : undefined}>
          All ratings
        </Link>
        <Link href={href({ tab: "reviews" })} aria-current={tab === "reviews" ? "page" : undefined}>
          Product reviews
        </Link>
      </nav>

      <FilterBar
        label={tab === "reviews" ? "Filter product reviews" : "Filter ratings"}
        submitLabel={tab === "reviews" ? "Show reviews" : "Show ratings"}
        clearHref={filtered || period !== 30 ? href({ q: undefined, rating: undefined, period: "30" }) : undefined}
      >
        <input type="hidden" name="tab" value={tab} />
        <label>
          Search <small>{tab === "reviews" ? "product, review or reviewer" : "order number, name or phone"}</small>
          <input name="q" defaultValue={term} maxLength={80} />
        </label>
        {tab !== "attention" && (
          <label>
            Rating
            <select name="rating" defaultValue={rating ? String(rating) : ""}>
              <option value="">Any rating</option>
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={stars}>
                  {stars} {noun(stars, "star", "stars")}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab !== "reviews" && (
          <label>
            Period <small>scoreboard and All ratings</small>
            <select name="period" defaultValue={String(period)}>
              {PERIODS.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
              <option value="all">All time</option>
            </select>
          </label>
        )}
      </FilterBar>

      <div className="results-line feedback-results" role="status">
        <span>
          <strong>{shown.total}</strong>{" "}
          {tab === "reviews" ? noun(shown.total, "product review", "product reviews") : noun(shown.total, "rating", "ratings")}
          {tab === "attention" && " with 1 or 2 stars, not read yet"}
          {tab === "unread" && " not read yet"}
          {tab === "all" && ` · ${periodWords.toLowerCase()}`}
          {filtered && " · filtered"}
          {shown.pages > 1 && ` · page ${shown.page} of ${shown.pages}`}
        </span>
        {tab === "reviews" && <Link href="/admin/reviews">Reported reviews</Link>}
      </div>
      {tab === "unread" && board.unread > board.attention && (
        <ActionForm
          action={feedbackReadAction}
          submit="Mark 3–5 star feedback as read"
          className="feedback-inline"
          buttonClassName="secondary-button compact-button"
        >
          <input type="hidden" name="intent" value="rest" />
        </ActionForm>
      )}

      {list &&
        (list.cards.length ? (
          <ul className="feedback-list">
            {list.cards.map((card) => {
              const low = card.rating <= LOW_RATING;
              return (
                <li key={card.id}>
                  <article
                    className={`panel feedback-item${card.read ? "" : " is-unread"}${low ? " is-low" : ""}`}
                    aria-label={`${card.customer}, order ${card.orderNumber}`}
                  >
                    <header className="feedback-item-head">
                      <Stars rating={card.rating} />
                      <strong>{card.customer}</strong>
                      {!card.read && <StatusPill tone={low ? "bad" : "warn"}>{low ? "Needs attention" : "Unread"}</StatusPill>}
                      <When at={card.submittedAt} />
                    </header>
                    <p className="feedback-item-order">
                      <Link href={`/admin/orders/${card.orderId}`}>{card.orderNumber}</Link>
                      {card.totalPaise != null && ` · ${formatPrice(card.totalPaise)}`}
                    </p>
                    <Said card={card} />
                    {card.reply && (
                      <div className="feedback-reply">
                        <strong>
                          Your reply · <When at={card.reply.at} />
                        </strong>
                        <p>{card.reply.body}</p>
                      </div>
                    )}
                    <div className="feedback-item-actions">
                      {!card.reply && (
                        <Link className="secondary-button compact-button" href={href({ page: list.page, reply: card.id }, "#reply")}>
                          <MessageSquareReply size={16} aria-hidden="true" /> Reply
                        </Link>
                      )}
                      {card.phone && (
                        <a className="secondary-button compact-button" href={`tel:+91${card.phone}`}>
                          <Phone size={16} aria-hidden="true" /> Call
                          <span className="sr-only"> {card.customer}</span>
                        </a>
                      )}
                      <ActionForm
                        action={feedbackReadAction}
                        submit={card.read ? "Mark as unread" : "Mark as read"}
                        className="feedback-inline"
                        buttonClassName="secondary-button compact-button"
                      >
                        <input type="hidden" name="feedbackId" value={card.id} />
                        <input type="hidden" name="intent" value={card.read ? "unread" : "read"} />
                      </ActionForm>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={MessageSquareHeart}
            heading="h3"
            title={
              filtered
                ? "No rating matches"
                : tab === "attention"
                  ? "No low rating waiting"
                  : tab === "unread"
                    ? "Everything is read"
                    : "No ratings yet"
            }
            body={
              filtered
                ? "Check the order number or name, or clear the filters."
                : tab === "all"
                  ? "After a delivery, customers are asked “How did we do?”. What they say lands here."
                  : "New ratings appear here as customers send them."
            }
          />
        ))}

      {reviews &&
        (reviews.rows.length ? (
          <ul className="feedback-list">
            {reviews.rows.map((review) => (
              <li key={review.id}>
                <article className="panel feedback-item" aria-label={`${review.product}, by ${review.customer}`}>
                  <header className="feedback-item-head">
                    <Stars rating={review.rating} />
                    <strong>{review.product}</strong>
                    <StatusPill tone={review.status === "hidden" ? "bad" : "ok"}>
                      {review.status === "hidden" ? "Hidden" : "Shown in the shop"}
                    </StatusPill>
                    <When at={review.createdAt} />
                  </header>
                  <ReviewBody review={review} />
                  <div className="feedback-item-actions">
                    <Link
                      className="secondary-button compact-button"
                      href={href({ page: reviews.page, review: review.id }, "#review")}
                    >
                      {review.status === "hidden" ? "Show again" : "Hide"}
                      <span className="sr-only"> the review of {review.product} by {review.customer}</span>
                    </Link>
                    {review.slug && review.status !== "hidden" && (
                      <Link className="secondary-button compact-button" href={`/products/${review.slug}#reviews`}>
                        View in the shop
                      </Link>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Sparkles}
            heading="h3"
            title={filtered ? "No product review matches" : "No product reviews yet"}
            body={
              filtered
                ? "Try other words, or clear the filters."
                : "Customers can review a product once it has been delivered to them."
            }
          />
        ))}

      {shown.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {shown.page > 1 ? (
            <Link className="secondary-button compact-button" href={href({ page: shown.page - 1 })}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {shown.page} of {shown.pages}
          </span>
          {shown.page < shown.pages ? (
            <Link className="secondary-button compact-button" href={href({ page: shown.page + 1 })}>
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

function ReviewBody({ review }: { review: OwnerReview }) {
  return (
    <>
      {review.title && <h3 className="feedback-review-title">{review.title}</h3>}
      {review.body ? <p className="feedback-comment">“{review.body}”</p> : !review.title && <p className="muted">Stars only, no words.</p>}
      <p className="muted feedback-rider">
        By {review.customer} · verified purchase
        {review.moderationReason && ` · Shop’s note: ${review.moderationReason}`}
      </p>
    </>
  );
}
