import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, ShoppingBag, Users } from "lucide-react";
import { productImages } from "@/lib/catalog/images";
import { requireSchoolPage } from "@/lib/schools/access";
import { quoteBasketView } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { SchoolMember } from "@/lib/schools/models";
import { quoteMoney } from "@/lib/schools/display";
import { estimateQuote } from "@/lib/schools/estimate";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { QuoteLineQuantity } from "@/components/quote-line-quantity";
import { ProceedWhenSaved, UnsavedProvider } from "@/components/send-when-saved";
import { AisleIcon } from "@/components/aisle-icon";
export const metadata = { title: "School basket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The school's one shared basket, laid out like the shop's: items on the left, the bill on the right. */
export default async function SchoolBasket({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { school } = await requireSchoolPage(s, "/school/basket");
  const [basket, people] = await Promise.all([
    quoteBasketView(school.id),
    SchoolMember.countDocuments({ schoolId: school.id }),
  ]);
  const estimate = estimateQuote(basket.lines);
  const others = Math.max(0, people - 1);
  return (
    <section className="page-container school-basket">
      <PageHeading
        eyebrow={school.name}
        title="Basket"
        aside={
          basket.lines.length > 0 ? (
            <Link href="/school/catalog" className="secondary-button">
              Add more items <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {basket.unavailable.length > 0 && (
        <div className="notice unavailable-lines" role="status">
          <p>These are no longer in the school catalogue. Take them out before checking out:</p>
          <ul>
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
          <div className="basket-layout">
            <div className="basket-main">
              <p className="school-shared">
                <Users size={18} aria-hidden="true" />
                {others
                  ? `Shared with ${others} ${others === 1 ? "other person" : "other people"} at ${school.name}. Anyone can add or change it.`
                  : `The basket for ${school.name}. Anyone the store adds for your school shares it.`}
              </p>
              <section className="panel basket-items" aria-labelledby="basket-items-heading">
                <h2 id="basket-items-heading">
                  {basket.lines.length} {basket.lines.length === 1 ? "item" : "items"} ·{" "}
                  {estimate.units.toLocaleString("en-IN")} {estimate.units === 1 ? "unit" : "units"}
                </h2>
                {basket.lines.map((line) => {
                  const image = line.image ?? productImages[line.slug];
                  return (
                    <div className="basket-line panel school-line" key={line.variantId}>
                      <div className="basket-product">
                        <div className="basket-thumb">
                          {image ? <Image src={image} alt="" fill sizes="72px" /> : <AisleIcon slug="school" />}
                        </div>
                        <div>
                          <h3>
                            <Link href={`/school/products/${line.slug}`}>{line.name}</Link>
                          </h3>
                          <p className="muted">
                            {line.label} ·{" "}
                            {line.schoolPricePaise != null
                              ? `${quoteMoney(line.schoolPricePaise)} each + GST${line.gstRatePercent != null ? ` (${line.gstRatePercent}%)` : ""}`
                              : "price on quotation"}
                          </p>
                          <p className="muted school-added">Added by {line.addedBy}</p>
                          <ActionForm
                            action={schoolRepAction}
                            submit="Remove"
                            className="basket-save"
                            buttonClassName="text-button"
                          >
                            <input type="hidden" name="intent" value="set" />
                            <input type="hidden" name="schoolId" value={school.id} />
                            <input type="hidden" name="variantId" value={line.variantId} />
                            <input type="hidden" name="quantity" value="0" />
                          </ActionForm>
                        </div>
                      </div>
                      <QuoteLineQuantity
                        schoolId={school.id}
                        variantId={line.variantId}
                        quantity={line.quantity}
                        name={line.name}
                      />
                      <strong>
                        {line.schoolPricePaise != null
                          ? quoteMoney(line.schoolPricePaise * line.quantity)
                          : "On quotation"}
                      </strong>
                    </div>
                  );
                })}
              </section>
            </div>
            <aside className="panel basket-bill">
              <h2>Expected bill</h2>
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
              <h3>
                Expected total <strong>{quoteMoney(estimate.totalPaise)}</strong>
              </h3>
              {basket.unavailable.length > 0 && (
                <p className="notice">Take out the items marked above before checking out.</p>
              )}
              <ProceedWhenSaved
                href="/school/checkout"
                className="primary-button"
                waiting="Save the quantity you changed first."
                disabled={basket.unavailable.length > 0}
              >
                Continue to checkout <ArrowRight size={18} aria-hidden="true" />
              </ProceedWhenSaved>
              <p className="muted summary-note">
                <FileText size={16} aria-hidden="true" />
                No payment here. At checkout you ask for a quotation; the store sends its prices with GST.
              </p>
            </aside>
          </div>
        </UnsavedProvider>
      ) : (
        !basket.unavailable.length && (
          <div className="panel empty-state">
            <ShoppingBag size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
            <h2>Your school’s basket is empty.</h2>
            <p>Add what your school needs, with how many. Anyone at your school can add to it.</p>
            <Link href="/school/catalog" className="primary-button">
              Browse school items
            </Link>
          </div>
        )
      )}
    </section>
  );
}
