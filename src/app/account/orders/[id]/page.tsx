import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Headphones,
  Package,
  ReceiptText,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { conversationAction } from "@/lib/chat/actions";
import { PageHeading } from "@/components/page-heading";
import { operationAction } from "@/lib/operations/actions";
import { PayButton } from "@/components/pay-button";
import { Payment } from "@/lib/payments/models";
import { Refund } from "@/lib/payments/models";
import { requirePage } from "@/lib/auth/session";
import { Order, OrderTimelineEvent } from "@/lib/commerce/models";
import { Product, ProductVariant } from "@/lib/db/models";
import { objectId } from "@/lib/commerce/service";
import { dayLabel } from "@/lib/commerce/slots";
import { cancelAction, reorderAction } from "@/lib/commerce/actions";
import { ActionForm } from "@/components/action-form";
import { customerStage, formatIst, formatPrice, methodLabel, paymentLabel } from "@/lib/display";
import { ProductReview } from "@/lib/reviews/models";
import { RateStars } from "@/components/rate-stars";
import { productImages } from "@/lib/catalog/images";
import { cancellation, orderHistory, orderTracker } from "@/lib/order-progress";
import { lineNotes, shortfallRefund, type PackedLine } from "@/lib/operations/packing";
import { isShopperVisible } from "@/lib/catalog/visibility";
import { canStillRate, feedbackForOrder } from "@/lib/feedback/service";
import { OrderFeedbackCard } from "@/components/order-feedback-card";
import { currentLocale } from "@/lib/i18n";
export const metadata = { title: "Order details", robots: { index: false } };

const STAGE_ICONS: Record<string, LucideIcon> = {
  delivered: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
  returned: XCircle,
  failed: XCircle,
  "out-for-delivery": Truck,
  attempted: Truck,
  "to-confirm": Clock3,
  "awaiting-payment": Clock3,
};
const SHORT = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } as const;

/** Each line's product page and photo, while the product is still in the catalogue. */
async function linePictures(variantIds: unknown[]) {
  const variants = await ProductVariant.find({ _id: { $in: variantIds } }).select("productId");
  const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } }).select(
    "slug status showToCustomers image images",
  );
  const pictures = new Map<string, { href?: string; image?: string }>();
  for (const variant of variants) {
    const product = products.find((p) => String(p._id) === String(variant.productId));
    if (!product) continue;
    pictures.set(String(variant._id), {
      href: isShopperVisible(product) ? `/products/${product.slug}` : undefined,
      image: product.images?.[0] ?? product.image ?? productImages[product.slug],
    });
  }
  return pictures;
}

/**
 * The order page, laid out like quick-commerce apps: where the order is on top, the items on the
 * left, and on the right the bill (amounts lined up on the right), the order's details and help.
 */
export default async function OrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage("order:own");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const o = await Order.findOne({ _id: id, customerId: user.id });
  if (!o) notFound();
  const payment =
    o.paymentMethod === "razorpay"
      ? await Payment.findOne({ orderId: o._id })
      : null;
  const refunds = await Refund.find({ orderId: o._id }).sort({ createdAt: -1 });
  const events = await OrderTimelineEvent.find({ orderId: id }).sort({ at: 1 });
  const lines: (PackedLine & { variantId: unknown })[] = o.items;
  const pictures = await linePictures(lines.map((line) => line.variantId));
  const stage = customerStage(o);
  const StageIcon = STAGE_ICONS[stage.key] ?? Package;
  const tracker = orderTracker(o, events, o.createdAt);
  const history = orderHistory(events);
  const cancelled = cancellation(events, o.customerId);
  // what each line's total is for: what went in the bag on a cash bill, what was paid for online
  // (the notes under a line say what packing changed), as the invoice and the orders list count
  const itemCount = lines.reduce((n, line) => n + line.quantity, 0);
  // packing notes about money are moot once the order is cancelled
  const notCancelled = o.orderStatus !== "cancelled";
  const shortfall = notCancelled ? shortfallRefund(o.shortfallPaise, refunds) : null;
  const itemsTotal = o.subtotalPaise ?? lines.reduce((n, line) => n + line.linePaise, 0);
  // packing can take items off a cash bill, and the MRP saving worked out at checkout would then be stale
  const mrpSaving = o.originalTotalPaise == null ? (o.merchandiseSavingsPaise ?? 0) : 0;
  const offer = o.promotionDiscountPaise ?? 0;
  const cashDue =
    o.paymentMethod === "cod" && o.orderStatus !== "cancelled" && (o.codStatus ?? "uncollected") === "uncollected";
  const day = o.deliveryDate ? dayLabel(o.deliveryDate) : "";
  const slot = day ? `${day} · ${o.deliveryWindow}` : o.deliveryWindow;
  const arriving = `Arriving ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : `on ${day}`}, ${o.deliveryWindow}`;
  const deliveredAt = tracker?.[3].at;
  // a delivered order can be rated here for a month; once rated, the rating and the shop's reply show instead
  const delivered = o.deliveryStatus === "delivered" && o.orderStatus !== "cancelled";
  const [feedback, locale] = delivered ? await Promise.all([feedbackForOrder(o._id), currentLocale()]) : [null, "en" as const];
  const showFeedback = delivered && (feedback !== null || canStillRate(deliveredAt ?? o.updatedAt));
  const headline: Record<string, string> = {
    delivered: deliveredAt ? `Delivered on ${formatIst(deliveredAt, SHORT)}` : "Delivered to you",
    completed: deliveredAt ? `Delivered on ${formatIst(deliveredAt, SHORT)}` : "Delivered to you",
    cancelled: cancelled
      ? `${cancelled.byCustomer ? "You cancelled this order" : "The shop cancelled this order"} on ${formatIst(cancelled.at, SHORT)}.${
          !cancelled.byCustomer && cancelled.reason ? ` Reason: ${cancelled.reason}` : ""
        }`
      : "This order was cancelled.",
    returned: "The delivery didn’t go through, so your order went back to the shop.",
    failed: "The delivery partner couldn’t hand this over. The shop will arrange another try.",
    attempted: "The delivery partner couldn’t hand this over. The shop will arrange another try.",
    "out-for-delivery": `On its way to you now · ${o.deliveryWindow}`,
    "awaiting-payment": "Complete your online payment to confirm this order.",
  };
  // a delivered order asks for a one-tap rating of each product still in the catalogue
  const rateable = [];
  if (o.deliveryStatus === "delivered") {
    const variants = await ProductVariant.find({
      _id: { $in: o.items.map((i: { variantId: unknown }) => i.variantId) },
    }).select("productId");
    const [products, reviews] = await Promise.all([
      Product.find({ _id: { $in: variants.map((v) => v.productId) }, status: "published" }).select("slug name"),
      ProductReview.find({ customerId: user.id, productId: { $in: variants.map((v) => v.productId) } }).select("productId rating"),
    ]);
    for (const product of products)
      rateable.push({
        id: String(product._id),
        slug: product.slug as string,
        name: product.name.en as string,
        rating: reviews.find((r) => String(r.productId) === String(product._id))?.rating as number | undefined,
      });
  }
  return (
    <section className="page-container order-page">
      <PageHeading eyebrow="Order summary" title={o.number} />

      <div className={`order-hero is-${stage.tone}`}>
        <span className="order-hero-icon">
          <StageIcon size={28} aria-hidden="true" />
        </span>
        <div>
          <h2 className="order-hero-title">
            <span className="sr-only">Status: </span>
            {stage.label}
          </h2>
          <p>{headline[stage.key] ?? arriving}</p>
        </div>
      </div>
      {rateable.length > 0 && (
        <section id="rate" className="panel rate-panel" aria-labelledby="rate-title">
          <h2 id="rate-title">Rate what you got</h2>
          <p className="muted">One tap is enough. It helps the next family choose.</p>
          {rateable.map((product) => (
            <div className="rate-row" key={product.id}>
              <Link href={`/products/${product.slug}`}>{product.name}</Link>
              <RateStars productId={product.id} slug={product.slug} name={product.name} rating={product.rating} />
            </div>
          ))}
        </section>
      )}
      {tracker && (
        <ol className="order-tracker" aria-label="Order progress">
          {tracker.map((step) => (
            <li key={step.key} className={`is-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
              <span className="tracker-dot">
                {step.state === "done" && <CheckCircle2 size={16} aria-hidden="true" />}
              </span>
              <strong>{step.label}</strong>
              {step.at && <small>{formatIst(step.at, SHORT)}</small>}
            </li>
          ))}
        </ol>
      )}

      <div className="order-layout">
        <div className="order-main">
          {showFeedback && (
            <OrderFeedbackCard
              order={{
                orderId: id,
                number: o.number,
                hasRider: Boolean(o.assignedTo) && String(o.assignedTo) !== user.id,
              }}
              locale={locale}
              feedback={feedback}
            />
          )}
          {o.deliveryStatus === "out-for-delivery" && (
            <section className="panel order-card handover-card" aria-labelledby="handover-title">
              <h2 id="handover-title">Your order is on the way</h2>
              <ActionForm action={operationAction} submit="Request delivery confirmation code">
                <input type="hidden" name="orderId" value={id} />
                <input type="hidden" name="operation" value="delivery-otp" />
                <p className="muted">
                  Share this code with the delivery partner only after receiving your complete order.
                </p>
              </ActionForm>
            </section>
          )}

          <section className="panel order-card" aria-labelledby="items-title">
            <h2 id="items-title">
              {itemCount} {itemCount === 1 ? "item" : "items"} in this order
            </h2>
            {/* each line's count goes with its total; anything the shop didn't have, or swapped, says so under its name */}
            <ul className="order-item-list">
              {lines.map((line) => {
                const picture = pictures.get(String(line.variantId));
                return (
                  <li className="order-item" key={String(line.variantId)}>
                    <span className="order-item-thumb">
                      {picture?.image ? (
                        <Image src={picture.image} alt="" fill sizes="56px" />
                      ) : (
                        <Package size={22} strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </span>
                    <span className="order-item-info">
                      {picture?.href ? <Link href={picture.href}>{line.name}</Link> : <span>{line.name}</span>}
                      <small>
                        {line.label}
                        {line.quantity > 0 && ` · ${line.quantity} × ${formatPrice(line.pricePaise)}`}
                      </small>
                      {lineNotes(line, o.paymentMethod === "cod").map((note) => (
                        <small className="line-note" key={note}>
                          {note}
                        </small>
                      ))}
                    </span>
                    <strong>{formatPrice(line.linePaise)}</strong>
                  </li>
                );
              })}
            </ul>
            <div className="order-item-actions">
              <ActionForm action={reorderAction} submit="Add these items again">
                <input type="hidden" name="orderId" value={id} />
              </ActionForm>
            </div>
          </section>
        </div>

        <div className="order-side">
          <section className="panel order-card bill-card" aria-labelledby="bill-title">
            <h2 id="bill-title">Bill details</h2>
            <dl className="bill-rows">
              <div>
                <dt>Item total</dt>
                <dd>
                  {mrpSaving > 0 && <s>{formatPrice(itemsTotal + mrpSaving)}</s>}
                  {formatPrice(itemsTotal)}
                </dd>
              </div>
              {offer > 0 && (
                <div className="is-saving">
                  <dt>{o.appliedPromotion?.code ? `Coupon ${o.appliedPromotion.code}` : (o.appliedPromotion?.name ?? "Offer")}</dt>
                  <dd>−{formatPrice(offer)}</dd>
                </div>
              )}
              <div>
                <dt>Delivery fee</dt>
                <dd>{o.deliveryPaise ? formatPrice(o.deliveryPaise) : <span className="bill-free">FREE</span>}</dd>
              </div>
            </dl>
            <p className="bill-total">
              <span>{cashDue ? "To pay on delivery" : "Grand total"}</span>
              <strong>{formatPrice(o.totalPaise)}</strong>
            </p>
            {mrpSaving + offer > 0 && o.orderStatus !== "cancelled" && (
              <p className="bill-saved">You saved {formatPrice(mrpSaving + offer)} on this order</p>
            )}
            {/* "To pay on delivery" already says it for cash still to collect */}
            {!cashDue && <p className="bill-payment">{paymentLabel(o)}</p>}
            {notCancelled && o.originalTotalPaise != null && (
              <p className="notice">
                Some items weren’t available, so they came off your bill: your
                total went from {formatPrice(o.originalTotalPaise)} to{" "}
                {formatPrice(o.totalPaise)}.
              </p>
            )}
            {/* the payment itself is only ever changed from the store's Refunds page; this reads
                where that refund stands */}
            {shortfall === "owed" && (
              <p className="notice">
                Some items weren’t available. You paid online, so the store will
                arrange a refund of {formatPrice(o.shortfallPaise)} for them. It
                shows under Refunds here once it is made.
              </p>
            )}
            {shortfall === "under-way" && (
              <p className="notice">
                Some items weren’t available, so a refund of{" "}
                {formatPrice(o.shortfallPaise)} is on its way to you.
              </p>
            )}
            {shortfall === "refunded" && (
              <p className="notice">
                Some items weren’t available, and {formatPrice(o.shortfallPaise)}{" "}
                was refunded to you for them.
              </p>
            )}
            {payment?.refundNeeded && (
              <p className="notice">
                Payment was received after this order closed. The store has been
                notified to arrange your refund.
              </p>
            )}
            {refunds.length > 0 && (
              <div className="notice">
                <strong>Refunds</strong>
                {refunds.map((refund) => (
                  <p key={String(refund._id)}>
                    {formatPrice(refund.amountPaise)} · {refund.status}
                  </p>
                ))}
              </div>
            )}
            {o.paymentMethod === "razorpay" &&
              o.orderStatus === "placed" &&
              o.paymentStatus === "pending" &&
              o.expiresAt > new Date() && (
                <PayButton orderId={id} amount={o.totalPaise} />
              )}
            {/* a cancelled order has no bill to keep */}
            {o.orderStatus !== "cancelled" && (
              <a className="bill-invoice" href={`/api/invoices/${id}`}>
                <ReceiptText size={18} aria-hidden="true" /> Download invoice
              </a>
            )}
          </section>

          <section className="panel order-card" aria-labelledby="details-title">
            <h2 id="details-title">Order details</h2>
            <dl className="order-facts">
              <div>
                <dt>Order number</dt>
                <dd>{o.number}</dd>
              </div>
              <div>
                <dt>Placed on</dt>
                <dd>{formatIst(o.createdAt)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{methodLabel(o.paymentMethod)}</dd>
              </div>
              <div>
                <dt>Delivery slot</dt>
                <dd>{slot}</dd>
              </div>
              <div>
                <dt>Deliver to</dt>
                <dd>
                  <strong>{o.address.name}</strong>
                  <br />
                  {o.address.line}
                  <br />
                  {o.address.areaName} · {o.address.pin}
                  {o.address.instructions && <small>“{o.address.instructions}”</small>}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* under the items on wide screens; after the bill and details on phones */}
        <div className="order-extras">
          <section className="panel order-card order-help" aria-labelledby="help-title">
            <h2 id="help-title">
              <Headphones size={18} aria-hidden="true" /> Need help with this order?
            </h2>
            <p className="muted">Missing items, delivery or anything else: chat with the shop.</p>
            <ActionForm
              action={conversationAction}
              submit="Ask about this order"
              buttonClassName="secondary-button"
            >
              <input type="hidden" name="orderId" value={id} />
              <input type="hidden" name="title" value={`Help with ${o.number}`} />
            </ActionForm>
          </section>

          {o.orderStatus === "placed" && o.paymentMethod !== "razorpay" && (
            <section className="panel order-card order-cancel" aria-labelledby="cancel-title">
              <h2 id="cancel-title">Changed your mind?</h2>
              <p className="muted">You can cancel until the shop confirms your order.</p>
              <ActionForm
                action={cancelAction}
                submit="Cancel this order"
                buttonClassName="secondary-button"
                confirmMessage="Cancel this order and release its reserved stock? This cannot be undone."
              >
                <input type="hidden" name="orderId" value={id} />
                <label className="checkbox-label">
                  <input type="checkbox" required /> I want to cancel this order.
                </label>
              </ActionForm>
            </section>
          )}
          {history.length > 0 && (
            <details className="panel order-card order-history-log">
              <summary>Order history</summary>
              <ol>
                {history.map((entry) => (
                  <li key={`${entry.label}-${entry.at.toISOString()}`}>
                    <strong>{entry.label}</strong>
                    <small>{formatIst(entry.at, SHORT)}</small>
                    {entry.note && <small>Reason: {entry.note}</small>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
