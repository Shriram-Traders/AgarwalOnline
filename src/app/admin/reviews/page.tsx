import Link from "next/link";
import mongoose from "mongoose";
import { Sparkles } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { ProductReview, ReviewReport } from "@/lib/reviews/models";
import { Product, User } from "@/lib/db/models";
import { moderateReviewAction } from "@/lib/reviews/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { When } from "@/components/when";
export const metadata = { title: "Reviews", robots: { index: false } };

/** Five stars as text, with the number for screen readers. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars">
      <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
      <span className="sr-only">{rating} of 5</span>
    </span>
  );
}

export default async function ReviewModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; rating?: string }>;
}) {
  await requirePage("review:moderate");
  const params = await searchParams;
  const reports = await ReviewReport.find({ status: "open" }).sort({ createdAt: -1 }).limit(100);
  const reviews = await ProductReview.find({ _id: { $in: reports.map((report) => report.reviewId) } });
  const [products, customers] = await Promise.all([
    Product.find({ _id: { $in: reviews.map((review) => review.productId) } }).select("name"),
    User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name"),
  ]);
  const rows = reports
    .map((report) => {
      const review = reviews.find((item) => String(item._id) === String(report.reviewId));
      if (!review) return null;
      const product = products.find((item) => String(item._id) === String(review.productId));
      const customer = customers.find((item) => String(item._id) === String(review.customerId));
      return {
        id: String(report._id),
        report,
        review,
        product: (product?.name.en as string | undefined) ?? "Product review",
        customer: (customer?.name as string | undefined) ?? "Customer",
      };
    })
    .filter((row) => row !== null);
  const q = params.q?.trim().toLowerCase().slice(0, 80);
  const rating = Number(params.rating) || 0;
  const shown = rows.filter(
    (row) =>
      (!q || [row.product, row.review.title ?? "", row.review.body ?? "", row.customer].some((text) => text.toLowerCase().includes(q))) &&
      (!rating || row.review.rating === rating),
  );
  const filtered = Boolean(q || rating);
  const viewing = params.view && mongoose.isValidObjectId(params.view) ? rows.find((row) => row.id === params.view) : undefined;
  const keep = new URLSearchParams(
    Object.entries({ q: params.q?.trim(), rating: rating ? String(rating) : "" }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const listHref = `/admin/reviews${keep.size ? `?${keep}` : ""}`;
  const viewHref = (id: string) => {
    const next = new URLSearchParams(keep);
    next.set("view", id);
    return `/admin/reviews?${next}#review`;
  };
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Reviews"
        lead="Reviews a shopper has reported. Only people who bought the product can review it. Open one to keep it or hide it."
      />
      {viewing && (
        <div className="panel adjust-panel" id="review" tabIndex={-1}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Verified purchase · reported <When at={viewing.report.createdAt} /></span>
              <h2>{viewing.product}</h2>
            </div>
            <Link href={listHref} className="text-button">
              Close
            </Link>
          </div>
          <p>
            <Stars rating={viewing.review.rating} />
          </p>
          {viewing.review.title && <h3>{viewing.review.title}</h3>}
          {viewing.review.body && <p>{viewing.review.body}</p>}
          <p className="muted">
            By {viewing.customer} · Report reason: {viewing.report.reason}
          </p>
          <ActionForm action={moderateReviewAction} submit="Save moderation">
            <input type="hidden" name="reviewId" value={String(viewing.review._id)} />
            <label>
              Decision
              <select name="status" defaultValue="hidden">
                <option value="hidden">Hide review</option>
                <option value="published">Keep published</option>
              </select>
            </label>
            <label>
              Moderation note
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
          </ActionForm>
        </div>
      )}
      <FilterBar label="Filter reported reviews" submitLabel="Show reviews" clearHref={filtered ? "/admin/reviews" : undefined}>
        <label>
          Search <small>product, review or reviewer</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Rating
          <select name="rating" defaultValue={rating ? String(rating) : ""}>
            <option value="">Any rating</option>
            {[1, 2, 3, 4, 5].map((stars) => (
              <option key={stars} value={stars}>
                {stars} {stars === 1 ? "star" : "stars"}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{shown.length}</strong> {shown.length === 1 ? "review" : "reviews"} to check
          {filtered ? ` of ${rows.length}` : ""}
        </span>
      </p>
      <DataTable
        caption="Reported reviews with their product, rating, reviewer and the reason given"
        rows={shown}
        rowKey={(row) => row.id}
        columns={[
          {
            header: "Product",
            cell: (row) => (
              <span className="product-cell">
                <span>
                  <Link href={viewHref(row.id)}>
                    <strong>{row.product}</strong>
                  </Link>
                  {row.review.title && <small>{row.review.title}</small>}
                </span>
              </span>
            ),
          },
          { header: "Rating", cell: (row) => <Stars rating={row.review.rating} /> },
          { header: "Reviewer", cell: (row) => row.customer },
          { header: "Reason", cell: (row) => row.report.reason },
          { header: "Reported", cell: (row) => <When at={row.report.createdAt} /> },
        ]}
        empty={
          <EmptyState
            icon={Sparkles}
            title={filtered ? "No reported review matches" : "Nothing to check"}
            body={
              filtered
                ? "Try other words, or clear the filters."
                : "When a shopper reports a review, it appears here for a decision."
            }
            heading="h3"
          />
        }
      />
    </section>
  );
}
