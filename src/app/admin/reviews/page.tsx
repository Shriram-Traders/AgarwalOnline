import { requirePage } from "@/lib/auth/session";
import { Sparkles } from "lucide-react";
import { ProductReview, ReviewReport } from "@/lib/reviews/models";
import { Product, User } from "@/lib/db/models";
import { moderateReviewAction } from "@/lib/reviews/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Reviews", robots: { index: false } };

export default async function ReviewModerationPage() {
  await requirePage("review:moderate");
  const reports = await ReviewReport.find({ status: "open" }).sort({ createdAt: -1 }).limit(100);
  const reviews = await ProductReview.find({ _id: { $in: reports.map((report) => report.reviewId) } });
  const [products, customers] = await Promise.all([
    Product.find({ _id: { $in: reviews.map((review) => review.productId) } }).select("name"),
    User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name"),
  ]);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Reviews"
        lead="Reviews a shopper has reported. Only people who bought the product can review it."
        aside={<span className="order-count">{reports.length} to check</span>}
      />
      {reports.map((report) => {
        const review = reviews.find((item) => String(item._id) === String(report.reviewId));
        if (!review) return null;
        const product = products.find((item) => String(item._id) === String(review.productId));
        const customer = customers.find((item) => String(item._id) === String(review.customerId));
        return (
          <article className="panel" key={String(report._id)}>
            <div className="panel-heading"><div><span className="eyebrow">{"★".repeat(review.rating)} · Verified purchase</span><h2>{product?.name.en ?? "Product review"}</h2></div><span className="status-pill">Reported</span></div>
            <h3>{review.title}</h3><p>{review.body}</p><p className="muted">By {customer?.name ?? "Customer"} · Report reason: {report.reason}</p>
            <ActionForm action={moderateReviewAction} submit="Save moderation">
              <input type="hidden" name="reviewId" value={String(review._id)} />
              <label>Decision<select name="status" defaultValue="hidden"><option value="hidden">Hide review</option><option value="published">Keep published</option></select></label>
              <label>Moderation note<input name="reason" minLength={3} maxLength={300} required /></label>
            </ActionForm>
          </article>
        );
      })}
      {!reports.length && <div className="panel empty-state"><Sparkles size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" /><h2>Nothing to check</h2><p>When a shopper reports a review, it appears here for a decision.</p></div>}
    </section>
  );
}
