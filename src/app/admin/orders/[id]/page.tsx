import { Fragment } from "react";
import { notFound } from "next/navigation";
import { formatPrice, methodLabel } from "@/lib/display";
import { StatusStrip } from "@/components/status-pill";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Order, OrderTimelineEvent } from "@/lib/commerce/models";
import { User } from "@/lib/db/models";
import {
  PackingChecklist,
  CODCollection,
  DeliveryAttempt,
} from "@/lib/operations/models";
import {
  awaitingDecision,
  cancellable,
  paidOnline,
  riderChangeable,
} from "@/lib/operations/transitions";
import { objectId } from "@/lib/commerce/service";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { When } from "@/components/when";
import { FocusOnHash } from "@/components/focus-on-hash";
import { operationAction } from "@/lib/operations/actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
import { MoneyInput } from "@/components/money-input";
import { PhotoInput } from "@/components/photo-input";
import { Refund } from "@/lib/payments/models";
import {
  HOW_MANY,
  lineName,
  lineNotes,
  NONE_LEFT,
  orderedOf,
  reviewChecklist,
  shortfallRefund,
  type ChecklistEntry,
  type PackedLine,
} from "@/lib/operations/packing";
export const metadata = { title: "Order", robots: { index: false } };
type Line = PackedLine & { variantId: string };
/**
 * The customer's "If an item is unavailable" choice from their account page, and what it asks of
 * the packer. It used to be saved and never shown, so packers swapped items for people who had
 * said not to.
 */
const PREFERENCE: Record<string, { said: string; ask: string }> = {
  // the choice covers leaving an item out too; with no answer, nothing is swapped without a yes
  contact: {
    said: "Contact me",
    ask: `Call them before you leave anything out or pack a substitute. If they don’t answer, don’t substitute: tick “${NONE_LEFT}”.`,
  },
  "best-match": {
    said: "Choose the closest match",
    ask: "You can pack the closest match, at the same price.",
  },
  "no-substitutions": {
    said: "Do not substitute",
    ask: `Don’t pack a substitute: tick “${NONE_LEFT}” instead.`,
  },
};
function Hidden({ id, operation }: { id: string; operation: string }) {
  return (
    <>
      <input type="hidden" name="orderId" value={id} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
}
/**
 * Shown instead of an empty rider list, which used to be a dead end: says who can fix it and
 * where. Only owners can open Staff & roles, so everyone else is told to ask.
 */
function NoRider({ owner, other = false }: { owner: boolean; other?: boolean }) {
  return (
    <p className="notice">
      {other
        ? "No other delivery partner can take it right now."
        : "No delivery partner can take orders right now."}{" "}
      {owner ? (
        <>
          Give someone the delivery role in{" "}
          <Link href="/super-admin/staff">Staff & roles</Link>.
        </>
      ) : (
        "Ask the owner to give someone the delivery role in Staff & roles."
      )}
    </p>
  );
}
/** Where the delivery stands with its rider, in a line under their name. */
const RIDER_NOTE: Record<string, string> = {
  // "given", not "has it": the parcel may still be on the shop's shelf
  assigned: "Given this delivery; hasn’t set off yet.",
  "out-for-delivery":
    "Out for delivery now, so the order can’t be changed or cancelled until the rider marks it delivered or not delivered.",
  attempted: "Tried to deliver it and couldn’t.",
  failed: "Couldn’t deliver it.",
  delivered: "Delivered it.",
  returned: "Brought it back to the shop.",
};
/** The Refunds page with this order already chosen; it opens for owners only. */
const refundsFor = (id: string) => `/super-admin/refunds?order=${id}`;
/** Online payments are only refunded from the owner's Refunds page, never from an order. */
function PaidOnlineNote({
  id,
  refunds,
  what,
}: {
  id: string;
  refunds: boolean;
  what: string;
}) {
  return (
    <p className="notice">
      This order was paid online, so the refund comes first:{" "}
      {refunds ? (
        <>
          refund it separately from the{" "}
          <Link href={refundsFor(id)}>Refunds page</Link>.
        </>
      ) : (
        "the owner handles it separately from the Refunds page."
      )}{" "}
      Once the full amount is refunded, you can {what} here.
    </p>
  );
}
/**
 * A cancelled order that still holds an online payment (it came in after the order was called
 * off). Payments stay on the Refunds page, so this only says who returns the money and where.
 */
function RefundStillDue({
  id,
  refunds,
  partly,
}: {
  id: string;
  refunds: boolean;
  partly: boolean;
}) {
  const rest = partly ? "the rest" : "it";
  return (
    <>
      {" "}
      {partly
        ? "Only part of the customer’s online payment has been refunded so far: "
        : "The customer paid online for it, so the money has to go back: "}
      {refunds ? (
        <>
          refund {rest} from the <Link href={refundsFor(id)}>Refunds page</Link>.
        </>
      ) : (
        `ask the owner to refund ${rest} from the Refunds page.`
      )}
    </>
  );
}
/** Why each step matters, shown under the button that takes it. */
const NEXT_HINTS: Record<string, string> = {
  confirmed: "The customer is waiting to hear back. Confirm once the store can fulfil it in this delivery window.",
  picking: "Start collecting the items; the packing checklist opens next.",
  packed: "Mark it packed once every item in the checklist is counted.",
  ready: "Set it aside for a delivery partner to collect.",
  completed: "It has been delivered. Completing it closes the order.",
};
export default async function ManageOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage("order:manage");
  const owner = hasPermission(user.roles, "staff:manage");
  const refunds = hasPermission(user.roles, "refund:write");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const o = await Order.findById(id);
  if (!o) notFound();
  const [packing, cash, partners, events, evidence, rider, attempt, customer, refundList] =
    await Promise.all([
      PackingChecklist.findOne({ orderId: id }),
      CODCollection.findOne({ orderId: id }),
      User.find({ roles: "delivery", active: true })
        .sort({ name: 1 })
        .select("name"),
      OrderTimelineEvent.find({ orderId: id }).sort({ at: 1 }),
      UploadedEvidence.find({ orderId: id }).sort({ createdAt: -1 }),
      o.assignedTo
        ? User.findById(o.assignedTo).select("name phone active roles")
        : null,
      awaitingDecision(o)
        ? DeliveryAttempt.findOne({ orderId: id }).sort({ at: -1 })
        : null,
      User.findById(o.customerId).select("substitutionPreference"),
      // read only, to say whether the refund for items not packed has been made yet
      (o.shortfallPaise ?? 0) > 0
        ? Refund.find({ orderId: id }).sort({ createdAt: -1 }).select("amountPaise status updatedAt")
        : [],
    ]);
  const preference = customer
    ? PREFERENCE[customer.substitutionPreference ?? "contact"]
    : undefined;
  // cash is taken at the door, so a cash bill follows what was packed; an online payment doesn't
  const charged = o.paymentMethod === "cod";
  const lines = o.items as Line[];
  const savedLine = (line: Line): ChecklistEntry | undefined =>
    packing?.items.find(
      (p: { variantId: string }) => String(p.variantId) === String(line.variantId),
    );
  // the saved checklist against the order: lines still to finish, and lines the order doesn't show yet
  const review = packing ? reviewChecklist(lines, packing.items) : null;
  // saved as work in progress: the lines packed short with nothing said about the rest
  const unfinished = review && !packing?.completedAt ? review.waiting : [];
  // finished before orders followed their packing: one more save tells the customer and fixes the order
  const behind =
    review && packing?.completedAt ? [...review.open, ...review.behind] : [];
  const refundState = shortfallRefund(o.shortfallPaise, refundList);
  const refundedAt = refundList.find((r: { status: string }) => r.status === "processed")?.updatedAt;
  // what the shelf didn't have is back on sale, and a substitute's own count wasn't taken down
  const recount = lines.filter((line) => (line.unavailableQuantity ?? 0) > 0);
  const swappedIn = lines.filter((line) => (line.substituteQuantity ?? 0) > 0 && line.substituteName);
  const stockCheck =
    o.orderStatus === "confirmed" &&
    ["picking", "packed"].includes(o.fulfilmentStatus) &&
    (recount.length > 0 || swappedIn.length > 0);
  // only the riders the order can move to
  const otherRiders = partners.filter(
    (p) => String(p._id) !== String(o.assignedTo),
  );
  const cancelled = o.orderStatus === "cancelled";
  // a missed attempt: the rider may still try again, and Try again is the same move as Remove rider
  const missed = awaitingDecision(o) && o.deliveryStatus === "attempted";
  // the latest "cancelled" entry says when and why, for the note at the top
  const cancelEvent = cancelled
    ? [...events]
        .reverse()
        .find((e) => e.dimension === "order" && e.next === "cancelled")
    : undefined;
  const byCustomer =
    cancelEvent &&
    !cancelEvent.notes &&
    String(cancelEvent.actorId) === String(o.customerId);
  // payment timeouts are recorded as the customer's; a staff cancel sent the customer its reason
  const byStore =
    cancelEvent && String(cancelEvent.actorId) !== String(o.customerId);
  // why an order is back in "Packed, no rider" (Try again, Remove rider, a rider paused)
  const lastDelivery = [...events]
    .reverse()
    .find((e) => e.dimension === "delivery");
  const backAgain =
    lastDelivery?.next === "unassigned" && lastDelivery.notes
      ? lastDelivery
      : undefined;
  const next = !["placed", "confirmed"].includes(o.orderStatus)
    ? null
    : o.orderStatus === "placed"
      ? { dimension: "order", next: "confirmed", label: "Confirm order" }
      : o.deliveryStatus === "delivered"
        ? { dimension: "order", next: "completed", label: "Complete order" }
        : o.fulfilmentStatus === "unassigned"
          ? { dimension: "fulfilment", next: "picking", label: "Start picking" }
          : o.fulfilmentStatus === "picking"
            ? { dimension: "fulfilment", next: "packed", label: "Mark packed" }
            : o.fulfilmentStatus === "packed"
              ? {
                  dimension: "fulfilment",
                  next: "ready",
                  label: "Ready for pickup",
                }
              : null;
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin#orders">Orders</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{o.number}</span>
      </nav>
      <PageHeading
        eyebrow="Order"
        title={o.number}
        lead={`${o.address.name} · ${o.deliveryDate} · ${o.deliveryWindow}`}
      />
      <StatusStrip
        items={[
          { label: "Order", value: o.orderStatus },
          { label: "Packing", value: o.fulfilmentStatus },
          { label: "Delivery", value: o.deliveryStatus },
          {
            label: "Payment",
            value: o.paymentStatus,
            // "Paid" on a cancelled order is money still to give back, not good news
            tone: cancelled && paidOnline(o) ? "warn" : undefined,
          },
        ]}
      />
      {cancelled && (
        <>
          {/* Cancel and Returned to shop land here: their panels go away with the open order */}
          <p
            className="notice order-closed"
            id="order-closed"
            tabIndex={-1}
            role="status"
          >
            {o.deliveryStatus === "returned" ? (
              <>
                Returned to shop and cancelled
                {cancelEvent && (
                  <>
                    {" "}
                    <When at={cancelEvent.at} />
                  </>
                )}
                . Its stock is back on sale and the customer was told.
              </>
            ) : (
              <>
                Cancelled
                {cancelEvent && (
                  <>
                    {" "}
                    <When at={cancelEvent.at} />
                    {byCustomer ? " by the customer" : ""}
                    {cancelEvent.notes
                      ? `: ${cancelEvent.notes.replace(/[.!?]+$/, "")}`
                      : ""}
                  </>
                )}
                .
                {byStore &&
                  " The customer was told why, and its stock and delivery slot are free again."}
                {o.fulfilmentStatus !== "unassigned" &&
                  " Put any items picked for it back on the shelf."}
              </>
            )}
            {/* e.g. an online payment that went through after staff cancelled it */}
            {paidOnline(o) && (
              <RefundStillDue
                id={id}
                refunds={refunds}
                partly={o.paymentStatus === "partially-refunded"}
              />
            )}
          </p>
          <FocusOnHash id="order-closed" />
        </>
      )}
      <div className="basket-layout order-layout">
        <div>
          <div className="panel">
            <h2>Items</h2>
            <table className="order-lines">
              <caption className="sr-only">Items in this order with quantity and price</caption>
              <tbody>
                {lines.map((i) => (
                  <tr key={String(i.variantId)}>
                    {/* what the line total is for: what went in the bag on a cash bill, what was
                        paid for online; the notes below the name say what packing changed */}
                    <td>{i.quantity ? `${i.quantity} ×` : "–"}</td>
                    <td>
                      {i.name}
                      <small>{i.label}</small>
                      {lineNotes(i, charged).map((note) => (
                        <small className="line-note" key={note}>
                          {note}
                        </small>
                      ))}
                    </td>
                    <td>{formatPrice(i.linePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>Items</th>
                  <td>{formatPrice(o.subtotalPaise ?? 0)}</td>
                </tr>
                {(o.promotionDiscountPaise ?? 0) > 0 && (
                  <tr>
                    <th scope="row" colSpan={2}>Offer</th>
                    <td>−{formatPrice(o.promotionDiscountPaise)}</td>
                  </tr>
                )}
                <tr>
                  <th scope="row" colSpan={2}>Delivery</th>
                  <td>{o.deliveryPaise ? formatPrice(o.deliveryPaise) : "Free"}</td>
                </tr>
                <tr className="order-total">
                  <th scope="row" colSpan={2}>Total · {methodLabel(o.paymentMethod).toLowerCase()}</th>
                  <td>{formatPrice(o.totalPaise)}</td>
                </tr>
                {o.originalTotalPaise != null && (
                  <tr>
                    <th scope="row" colSpan={2}>As ordered, before packing</th>
                    <td>{formatPrice(o.originalTotalPaise)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
            {o.originalTotalPaise != null && (
              <p className="muted">
                Items that weren’t available came off the bill, and the customer
                was told the new total.
              </p>
            )}
            {/* payments stay out: the shortfall on an online payment is only noted here, and read
                against the order's refunds (a cancelled order says who refunds what at the top) */}
            {refundState && !cancelled && (
              <p className={refundState === "refunded" ? "muted" : "notice"}>
                {refundState === "refunded" ? (
                  <>
                    Paid online: the {formatPrice(o.shortfallPaise)} for items
                    that weren’t packed has been refunded
                    {refundedAt && (
                      <>
                        {" "}
                        <When at={refundedAt} />
                      </>
                    )}
                    .
                  </>
                ) : refundState === "under-way" ? (
                  <>
                    Paid online: the refund of {formatPrice(o.shortfallPaise)} for
                    items that weren’t packed is under way
                    {refunds ? (
                      <>
                        {" "}
                        on the <Link href={refundsFor(id)}>Refunds page</Link>.
                      </>
                    ) : (
                      " on the owner’s Refunds page."
                    )}
                  </>
                ) : (
                  <>
                    Paid online: {formatPrice(o.shortfallPaise)} of the payment is
                    for items that weren’t packed, and the customer was told the
                    store will refund it. The payment stays as it is here:{" "}
                    {refunds ? (
                      <>
                        refund it from the{" "}
                        <Link href={refundsFor(id)}>Refunds page</Link>.
                      </>
                    ) : (
                      "the owner refunds it from the Refunds page, and it is on their work queue."
                    )}
                  </>
                )}
              </p>
            )}
            {stockCheck && (
              <p className="notice">
                {recount.length > 0 && (
                  <>
                    The shelf had fewer than the stock count shows for{" "}
                    {recount.map((line, index) => (
                      <Fragment key={String(line.variantId)}>
                        {index > 0 && ", "}
                        <Link href={`/admin/inventory?adjust=${line.variantId}#adjust`}>
                          {lineName(line)}
                        </Link>
                      </Fragment>
                    ))}
                    . What wasn’t packed is back on sale, so check the count and
                    fix it on Stock.{" "}
                  </>
                )}
                {swappedIn.length > 0 &&
                  `Take ${swappedIn
                    .map((line) => `${line.substituteQuantity} × ${line.substituteName}`)
                    .join(", ")} off ${swappedIn.length === 1 ? "its" : "their"} own stock count too, as ${
                    swappedIn.length === 1 ? "it" : "they"
                  } went in instead.`}
              </p>
            )}
          </div>
          <div className="panel">
            <h2>Packing checklist</h2>
            {/* first thing the packer reads, before swapping anything */}
            {!cancelled && preference && (
              <p className="notice packing-preference">
                <strong>
                  If an item is unavailable, the customer said: “{preference.said}”.
                </strong>{" "}
                {preference.ask}
                {preference === PREFERENCE.contact && o.address.phone && (
                  <>
                    {" "}
                    <a href={`tel:+91${o.address.phone}`}>Call +91 {o.address.phone}</a>
                  </>
                )}
              </p>
            )}
            {!cancelled && (
              <ActionForm action={evidenceAction} submit="Upload packing photo">
                <input type="hidden" name="purpose" value="packing" />
                <input type="hidden" name="orderId" value={id} />
                <label>
                  Packing photograph
                  <PhotoInput />
                </label>
              </ActionForm>
            )}
            <div className="evidence-strip">
              {evidence.map((item) => (
                <a
                  key={String(item._id)}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.purpose.replaceAll("-", " ")} photo
                </a>
              ))}
            </div>
            {!cancelled && o.fulfilmentStatus === "picking" ? (
              <ActionForm
                action={operationAction}
                submit="Save packing checklist"
              >
                <Hidden id={id} operation="packing" />
                <p className="muted">
                  Count what went in the bag. If you packed fewer than ordered,
                  tick “{NONE_LEFT}” or name what you packed instead, at the same
                  price; if only some of the rest was swapped, say how many and
                  tick “{NONE_LEFT}” for the others.{" "}
                  {charged
                    ? "Anything not available comes off the bill, and the customer is told."
                    : "The customer is told; their online payment stays as it is."}
                </p>
                {unfinished.length > 0 && (
                  <p className="notice">
                    {`Not finished yet: ${unfinished.join("; ")}. For each, tick “${NONE_LEFT}” or name the substitute.`}
                  </p>
                )}
                {behind.length > 0 && (
                  <p className="notice">
                    {`Save this checklist once more before marking it packed. It was finished before orders changed to match their packing, so the order and the customer don’t know yet what happened to ${behind.join(", ")}.`}
                  </p>
                )}
                {/* filled in from the last save, so a reload or a second save keeps every tick */}
                {lines.map((i) => {
                  const saved = savedLine(i);
                  const ordered = orderedOf(i);
                  return (
                    <fieldset className="packing-item" key={String(i.variantId)}>
                      <legend>
                        {i.name} · {i.label}
                      </legend>
                      <p>Ordered: {ordered}</p>
                      <label>
                        Packed quantity
                        <input
                          name={`packed_${i.variantId}`}
                          inputMode="numeric"
                          pattern="[0-9]{1,3}"
                          maxLength={3}
                          autoComplete="off"
                          defaultValue={saved?.packedQuantity ?? ordered}
                          required
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name={`missing_${i.variantId}`}
                          defaultChecked={saved?.missing ?? false}
                        />
                        {NONE_LEFT}
                      </label>
                      <div className="packing-swap">
                        {/* copied word for word onto the customer's message, order page and invoice */}
                        <label>
                          Packed instead of the rest{" "}
                          <small>
                            The customer sees this: name the product, e.g. Reynolds
                            blue pen. Same price as ordered.
                          </small>
                          <input
                            name={`substitution_${i.variantId}`}
                            maxLength={120}
                            placeholder="e.g. Reynolds blue pen"
                            defaultValue={saved?.substitution ?? ""}
                          />
                        </label>
                        <label>
                          {HOW_MANY} <small>Blank: all of the rest</small>
                          <input
                            name={`substitutes_${i.variantId}`}
                            inputMode="numeric"
                            pattern="[0-9]{1,3}"
                            maxLength={3}
                            autoComplete="off"
                            defaultValue={saved?.substituteQuantity ?? ""}
                          />
                        </label>
                      </div>
                    </fieldset>
                  );
                })}
              </ActionForm>
            ) : (
              <p className="muted">
                {cancelled
                  ? "This order is cancelled, so there is nothing to pack."
                  : o.fulfilmentStatus === "unassigned"
                    ? "The checklist opens when picking starts."
                    : "Packing is done for this order."}
              </p>
            )}
            {packing?.completedAt && !behind.length && (
              <p className="success-message">All quantities checked.</p>
            )}
          </div>
          <div className="panel">
            <h2>Timeline</h2>
            <ol>
              {events.map((e) => (
                <li key={String(e._id)}>
                  {e.dimension}: {e.previous} → {e.next}
                  <p className="muted">
                    {new Date(e.at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    {e.notes}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div>
          {next && (
            <div className="panel next-step">
              <span className="eyebrow">Next step</span>
              <h2>{next.label}</h2>
              <p className="muted">{NEXT_HINTS[next.next]}</p>
              <ActionForm action={operationAction} submit={next.label}>
                <Hidden id={id} operation="status" />
                <input type="hidden" name="dimension" value={next.dimension} />
                <input type="hidden" name="next" value={next.next} />
              </ActionForm>
            </div>
          )}
          {awaitingDecision(o) && (
            <div className="panel next-step">
              <span className="eyebrow">Next step</span>
              <h2>
                {o.deliveryStatus === "failed"
                  ? "Delivery failed"
                  : "Delivery attempt missed"}
              </h2>
              {attempt && (
                <p className="muted">
                  {rider?.name ?? "The rider"}: “{attempt.reason}” ·{" "}
                  <When at={attempt.at} />
                </p>
              )}
              {missed && (
                <p className="muted">
                  {rider?.name ?? "The rider"} can still try again from their
                  phone.
                </p>
              )}
              <ActionForm
                action={operationAction}
                submit="Try again"
                // while the rider may still be trying, this isn't the obvious next move
                buttonClassName={missed ? "secondary-button" : "primary-button"}
              >
                <Hidden id={id} operation="retry-delivery" />
                <p className="muted">
                  {missed
                    ? `Takes it off ${rider?.name ?? "the rider"} and puts it back in “Packed, no rider” for any rider to take out again.`
                    : "Puts it back in “Packed, no rider” so a rider can take it out again."}{" "}
                  Its stock stays set aside and the customer is told it will
                  come again.
                  {missed &&
                    ` Leave this if ${rider?.name ?? "the rider"} is still trying.`}
                </p>
              </ActionForm>
              {paidOnline(o) ? (
                <PaidOnlineNote
                  id={id}
                  refunds={refunds}
                  what="mark it returned to shop"
                />
              ) : (
                <ActionForm
                  action={operationAction}
                  submit="Returned to shop"
                  buttonClassName="secondary-button"
                  confirmMessage="Only once the parcel is back in the shop. The order is cancelled, its stock goes back on sale and the customer is told. This can’t be undone."
                >
                  <Hidden id={id} operation="return-to-shop" />
                  <p className="muted">
                    The parcel is back on the shelf: close the order as
                    cancelled and put its stock back on sale.
                  </p>
                </ActionForm>
              )}
            </div>
          )}
          {o.orderStatus === "confirmed" &&
            o.fulfilmentStatus === "ready" &&
            o.deliveryStatus === "unassigned" && (
              // Try again and Remove rider land here: the panel they were in is gone
              <div className="panel next-step" id="assign-rider" tabIndex={-1}>
                <span className="eyebrow">Next step</span>
                <h2>Assign delivery partner</h2>
                {backAgain && (
                  <p className="muted">
                    {backAgain.notes} · <When at={backAgain.at} />
                  </p>
                )}
                <FocusOnHash id="assign-rider" />
                {partners.length ? (
                  <ActionForm action={operationAction} submit="Assign delivery">
                    <Hidden id={id} operation="assign" />
                    <label>
                      Partner
                      <select name="partnerId" required>
                        <option value="">Choose partner</option>
                        {partners.map((p) => (
                          <option key={String(p._id)} value={String(p._id)}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </ActionForm>
                ) : (
                  <NoRider owner={owner} />
                )}
              </div>
            )}
          {rider && (
            <div className="panel">
              <h2>Rider</h2>
              <p>
                <strong>{rider.name}</strong>
                <br />
                {rider.phone ? (
                  <a href={`tel:+91${rider.phone}`}>Call +91 {rider.phone}</a>
                ) : (
                  <span className="muted">No phone number on file</span>
                )}
              </p>
              {RIDER_NOTE[o.deliveryStatus] && (
                <p className="muted">{RIDER_NOTE[o.deliveryStatus]}</p>
              )}
              {riderChangeable(o) && (
                <>
                  {(!rider.active || !rider.roles.includes("delivery")) && (
                    <p className="notice">
                      {rider.name} can’t sign in as a rider at the moment, so
                      this delivery won’t move until you change the rider.
                    </p>
                  )}
                  {/* the order just drops off their list, and their number goes from this page */}
                  <p className="muted">
                    {missed
                      ? `Changing the rider takes it off ${rider.name}’s list. If they still have the parcel from the missed delivery, call them first to bring it back to the shop.`
                      : `Changing or removing the rider takes it off ${rider.name}’s list. If they have already collected the parcel, call them first to bring it back to the shop.`}
                  </p>
                  <div className="rider-actions">
                    {otherRiders.length ? (
                      <ActionForm
                        action={operationAction}
                        submit="Change rider"
                        buttonClassName="secondary-button"
                      >
                        <Hidden id={id} operation="change-rider" />
                        <label>
                          Give it to
                          <select name="partnerId" required>
                            <option value="">Choose a rider</option>
                            {otherRiders.map((p) => (
                              <option key={String(p._id)} value={String(p._id)}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </ActionForm>
                    ) : (
                      <NoRider owner={owner} other />
                    )}
                    {/* after a missed attempt, Try again above is this same move, said once */}
                    {missed ? (
                      <p className="muted">
                        To take it off {rider.name} without choosing a new
                        rider, use Try again above.
                      </p>
                    ) : (
                      <ActionForm
                        action={operationAction}
                        submit="Remove rider"
                        buttonClassName="secondary-button"
                      >
                        <Hidden id={id} operation="remove-rider" />
                        <p className="muted">
                          Takes it off {rider.name}: back to “Packed, no rider”
                          for someone else to take.
                        </p>
                      </ActionForm>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <div className="panel">
            <h2>Customer</h2>
            <p>
              <strong>{o.address.name}</strong>
              {o.address.phone && (
                <>
                  <br />
                  <a href={`tel:+91${o.address.phone}`}>Call +91 {o.address.phone}</a>
                </>
              )}
            </p>
            <p>
              {o.address.line}
              <br />
              {o.address.areaName ? `${o.address.areaName} · ` : ""}
              {o.address.pin}
            </p>
            {o.address.instructions && <p className="muted">“{o.address.instructions}”</p>}
            <p>
              Delivery {o.deliveryDate} · {o.deliveryWindow}
            </p>
          </div>
          {cash && (
            <div className="panel">
              <h2>Cash handover</h2>
              <p>Collected: {formatPrice(cash.collectedPaise)}</p>
              {!cash.reconciledAt ? (
                <ActionForm
                  action={operationAction}
                  submit="Record cash handover"
                  confirmMessage="This records the cash as handed over and closes the collection. Check the amount against the notes in hand first."
                >
                  <Hidden id={id} operation="reconcile" />
                  <label>
                    Cash received (₹)
                    <MoneyInput name="receivedRupees" defaultValue={cash.collectedPaise / 100} />
                  </label>
                  <label>
                    Notes
                    <textarea name="note" maxLength={500} />
                  </label>
                </ActionForm>
              ) : (
                <>
                  <p>Received: {formatPrice(cash.receivedPaise)}</p>
                  <p
                    className={
                      cash.discrepancyPaise
                        ? "error-message"
                        : "success-message"
                    }
                  >
                    {cash.discrepancyPaise
                      ? `Discrepancy: ₹${cash.discrepancyPaise / 100}`
                      : "Cash reconciled"}
                  </p>
                  <p>{cash.reconciliationNote}</p>
                  {cash.discrepancyPaise && !cash.discrepancyResolvedAt ? (
                    <ActionForm
                      action={operationAction}
                      submit="Resolve discrepancy"
                      confirmMessage="This closes the cash discrepancy with your notes as the final record."
                    >
                      <Hidden id={id} operation="resolve-discrepancy" />
                      <label>
                        Resolution notes
                        <textarea
                          name="resolution"
                          minLength={5}
                          maxLength={500}
                          required
                        />
                      </label>
                    </ActionForm>
                  ) : cash.discrepancyResolvedAt ? (
                    <p className="success-message">
                      Resolved: {cash.discrepancyResolution}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
          {cancellable(o) && (
            <details className="panel danger-form cancel-order">
              <summary>Cancel this order</summary>
              {paidOnline(o) ? (
                <PaidOnlineNote id={id} refunds={refunds} what="cancel it" />
              ) : (
                <ActionForm
                  action={operationAction}
                  submit="Cancel order"
                  buttonClassName="secondary-button"
                  // their number goes from this page with the order, so the call comes first
                  confirmMessage={`The customer is told the reason, and the order’s stock and delivery slot are freed. ${rider ? `It comes off ${rider.name}’s list: if they have already collected the parcel, call them first to bring it back. ` : ""}This can’t be undone.`}
                >
                  <Hidden id={id} operation="cancel" />
                  <p className="muted">
                    For when the customer asks, or the store can’t fulfil it.
                    Only until it leaves the shop with a rider.
                  </p>
                  {o.paymentMethod === "razorpay" && (
                    <p className="muted">
                      {o.paymentStatus === "refunded"
                        ? "Its online payment was already refunded in full, so nothing more is owed."
                        : `Not paid yet. If the customer’s online payment still goes through after you cancel, this order will say so, and ${refunds ? "you refund it" : "the owner refunds it"} from the Refunds page.`}
                    </p>
                  )}
                  <label>
                    Reason <small>The customer sees this</small>
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={500}
                      required
                    />
                  </label>
                </ActionForm>
              )}
            </details>
          )}
        </div>
      </div>
      <RecordHistory target={id} title="Order history" />
    </section>
  );
}
