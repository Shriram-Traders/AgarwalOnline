import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { istDate } from "@/lib/commerce/delivery";
import { requireSchoolPage } from "@/lib/schools/access";
import { quoteBasketView } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { expectedPrice, quoteMoney, schoolHref } from "@/lib/schools/display";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { SchoolNav } from "@/components/school-nav";
import { QuoteLineQuantity } from "@/components/quote-line-quantity";
import { SendWhenSaved, UnsavedProvider } from "@/components/send-when-saved";
export const metadata = { title: "Quote basket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The school's one shared basket: everyone at the school adds to it, and anyone can send it. */
export default async function QuoteBasketPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { school, schools } = await requireSchoolPage(s);
  const basket = await quoteBasketView(school.id);
  const priced = basket.lines.filter((line) => line.schoolPricePaise != null);
  const expectedPaise = priced.reduce((n, line) => n + line.quantity * (line.schoolPricePaise ?? 0), 0);
  const units = basket.lines.reduce((n, line) => n + line.quantity, 0);
  const lineCount = basket.lines.length + basket.unavailable.length;
  return (
    <section className="page-container school-area">
      <SchoolNav school={school} current="quote" basketLines={lineCount} otherSchools={schools.length > 1} />
      <PageHeading
        title="Quote basket"
        lead="Everyone at your school shares this basket. Check the quantities, then ask the store for a quotation."
      />
      {basket.unavailable.length > 0 && (
        <div className="notice" role="status">
          <p>These are no longer in the school catalogue. Take them out before asking for a quotation:</p>
          <ul className="unavailable-lines">
            {basket.unavailable.map((line) => (
              <li key={line.variantId}>
                <span>
                  {line.name}
                  {line.label ? ` (${line.label})` : ""}
                </span>
                <ActionForm
                  action={schoolRepAction}
                  submit="Take out"
                  className="form-stack inline-grant"
                  buttonClassName="secondary-button compact-button"
                >
                  <input type="hidden" name="intent" value="set" />
                  <input type="hidden" name="schoolId" value={school.id} />
                  <input type="hidden" name="variantId" value={line.variantId} />
                  <input type="hidden" name="quantity" value="0" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      )}
      {basket.lines.length ? (
        <UnsavedProvider>
          <div className="quote-layout">
            <DataTable
              caption="Items in the school's quote basket"
              rows={basket.lines}
              rowKey={(line) => line.variantId}
              columns={[
                {
                  header: "Item",
                  cell: (line) => (
                    <span className="product-cell">
                      <span>
                        <strong>{line.name}</strong>
                        <small>
                          {line.label} · added by {line.addedBy}
                        </small>
                      </span>
                    </span>
                  ),
                },
                {
                  header: "Expected price",
                  cell: (line) => expectedPrice(line.schoolPricePaise, line.gstRatePercent, quoteMoney),
                },
                {
                  header: "Quantity",
                  cell: (line) => (
                    <QuoteLineQuantity
                      schoolId={school.id}
                      variantId={line.variantId}
                      quantity={line.quantity}
                      name={line.name}
                    />
                  ),
                },
                {
                  header: "Action",
                  cell: (line) => (
                    <ActionForm
                      action={schoolRepAction}
                      submit="Remove"
                      className="form-stack inline-grant"
                      buttonClassName="text-button"
                    >
                      <input type="hidden" name="intent" value="set" />
                      <input type="hidden" name="schoolId" value={school.id} />
                      <input type="hidden" name="variantId" value={line.variantId} />
                      <input type="hidden" name="quantity" value="0" />
                    </ActionForm>
                  ),
                },
              ]}
            />
            <aside className="panel quote-send">
              <h2>Ask for a quotation</h2>
              <dl className="quote-summary">
                <div>
                  <dt>Items</dt>
                  <dd>
                    {basket.lines.length} ({units.toLocaleString("en-IN")} {units === 1 ? "unit" : "units"})
                  </dd>
                </div>
                <div>
                  <dt>Expected, before GST</dt>
                  <dd>
                    {priced.length ? quoteMoney(expectedPaise) : "On quotation"}
                    {priced.length > 0 && priced.length < basket.lines.length && (
                      <small> for {priced.length} of {basket.lines.length} items; the rest are priced on the quotation</small>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="muted">The store sends its prices with GST. Nothing is ordered or paid for here.</p>
              <SendWhenSaved
                action={schoolRepAction}
                submit="Ask for a quotation"
                waiting="Save the quantity you changed first, then ask."
                disabled={basket.unavailable.length > 0}
              >
                <input type="hidden" name="intent" value="submit" />
                <input type="hidden" name="schoolId" value={school.id} />
                <input type="hidden" name="rev" value={basket.rev} />
                <label>
                  Needed by <small>Optional</small>
                  <input type="date" name="neededBy" min={istDate(new Date())} />
                </label>
                <label>
                  A note for the store <small>Optional</small>
                  <textarea
                    name="note"
                    maxLength={1000}
                    rows={3}
                    placeholder="e.g. Deliver to the school office; split by class if possible"
                  />
                </label>
              </SendWhenSaved>
            </aside>
          </div>
        </UnsavedProvider>
      ) : (
        !basket.unavailable.length && (
          <EmptyState
            icon={ClipboardList}
            title="The basket is empty"
            body="Add what your school needs from the catalogue, with how many. Anyone at your school can add to it."
            action={
              <Link href={schoolHref("/school", school.id)} className="primary-button">
                Open the catalogue
              </Link>
            }
          />
        )
      )}
    </section>
  );
}
