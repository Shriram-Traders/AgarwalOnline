import { redirect } from "next/navigation";
import { CalendarDays, FileText, MessageSquareText, School as SchoolIcon } from "lucide-react";
import { istDate } from "@/lib/commerce/delivery";
import { requireSchoolPage } from "@/lib/schools/access";
import { quoteBasketView } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { School } from "@/lib/schools/models";
import { quoteMoney } from "@/lib/schools/display";
import { estimateQuote } from "@/lib/schools/estimate";
import { GST_STATES } from "@/lib/tax/gst";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { PolicyNotice } from "@/components/policy-notice";
export const metadata = { title: "School checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SHOWN_LINES = 8;

/**
 * Checkout, as in the shop, but the last step asks for a quotation instead of payment: who
 * it's for, when it's needed and a note, then "Create quotation". The basket's `rev` goes
 * with it, so a change someone else made meanwhile is caught instead of quoted unseen.
 */
export default async function SchoolCheckout({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { school } = await requireSchoolPage(s, "/school/checkout");
  const [basket, record] = await Promise.all([
    quoteBasketView(school.id),
    School.findById(school.id).select("name address pin stateCode gstin contactName phone"),
  ]);
  // nothing to quote, or items to take out first: the basket says what to do
  if (!basket.lines.length || basket.unavailable.length) redirect("/school/basket");
  const estimate = estimateQuote(basket.lines);
  const state = GST_STATES.find((entry) => entry.code === record?.stateCode)?.name;
  return (
    <section className="page-container school-checkout">
      <PageHeading eyebrow={`${school.name} · almost there`} title="Checkout" />
      <ActionForm
        action={schoolRepAction}
        className="form-stack checkout-form"
        submit="Create quotation"
        offlineMessage="We couldn’t hear back from the store, so the request may or may not have gone through. Open Quotations to check before trying again."
      >
        <input type="hidden" name="intent" value="submit" />
        <input type="hidden" name="schoolId" value={school.id} />
        <input type="hidden" name="rev" value={basket.rev} />
        <div className="checkout-fields">
          <div className="panel">
            <h2>
              <SchoolIcon size={20} aria-hidden="true" /> Quotation for
            </h2>
            <p className="school-billing">
              <strong>{record?.name ?? school.name}</strong>
              {record?.address && <span>{record.address}</span>}
              {record?.pin && <span>PIN {record.pin}</span>}
              <span>
                {state ?? "State not set"}
                {record?.gstin ? ` · GSTIN ${record.gstin}` : " · No GSTIN on record"}
              </span>
            </p>
            <p className="muted">These details print on the quotation. If something is wrong, say so in the note.</p>
          </div>
          <div className="panel">
            <h2>
              <CalendarDays size={20} aria-hidden="true" /> When do you need it
            </h2>
            <label>
              Needed by <small>Optional</small>
              <input type="date" name="neededBy" min={istDate(new Date())} />
            </label>
          </div>
          <div className="panel">
            <h2>
              <MessageSquareText size={20} aria-hidden="true" /> Note for the store
            </h2>
            <label>
              Anything the store should know <small>Optional</small>
              <textarea
                name="note"
                maxLength={1000}
                rows={3}
                placeholder="Deliver to the school office in two lots"
              />
            </label>
          </div>
          <div className="panel school-no-payment">
            <h2>
              <FileText size={20} aria-hidden="true" /> No payment now
            </h2>
            <p className="muted">
              The store prices your list and sends a quotation with GST. You’ll find it under Quotations,
              where you can accept it or ask for changes. Nothing is charged or delivered until you agree.
            </p>
          </div>
        </div>
        <aside className="panel checkout-summary">
          <h2>Your basket</h2>
          <ul className="school-summary-lines">
            {basket.lines.slice(0, SHOWN_LINES).map((line) => (
              <li key={line.variantId}>
                <span>
                  {line.name} <small>{line.label}</small>
                </span>
                <b>× {line.quantity.toLocaleString("en-IN")}</b>
              </li>
            ))}
            {basket.lines.length > SHOWN_LINES && (
              <li className="muted">and {basket.lines.length - SHOWN_LINES} more</li>
            )}
          </ul>
          <p>
            Items, before GST <strong>{quoteMoney(estimate.subtotalPaise)}</strong>
          </p>
          <p>
            GST, estimated <strong>{quoteMoney(estimate.gstPaise)}</strong>
          </p>
          {estimate.onQuotation > 0 && (
            <p>
              Priced on the quotation{" "}
              <strong>
                {estimate.onQuotation} {estimate.onQuotation === 1 ? "item" : "items"}
              </strong>
            </p>
          )}
          <h3 className="summary-total">Expected total: {quoteMoney(estimate.totalPaise)}</h3>
          <p className="muted">Final prices come in the quotation.</p>
          <PolicyNotice kind="school-quote" />
        </aside>
      </ActionForm>
    </section>
  );
}
