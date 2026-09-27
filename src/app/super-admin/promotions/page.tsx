import { requirePage } from "@/lib/auth/session";
import { TicketPercent } from "lucide-react";
import { formatPrice } from "@/lib/display";
import { Promotion } from "@/lib/promotions/models";
import { promotionAdminAction } from "@/lib/promotions/actions";
import { ActionForm } from "@/components/action-form";
import { MoneyInput } from "@/components/money-input";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill, type Tone } from "@/components/status-pill";
export const metadata = { title: "Offers", robots: { index: false } };

/** A datetime-local value ("2026-09-27T18:00") for an IST moment. */
function istInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
const day = (date: Date) => date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

export default async function PromotionsPage() {
  await requirePage("promotion:write");
  const promotions = await Promotion.find({}).sort({ createdAt: -1 }).limit(100);
  const now = new Date();
  const state = (promotion: { active: boolean; startsAt: Date; endsAt: Date }): [string, Tone] =>
    !promotion.active
      ? ["Paused", "neutral"]
      : promotion.endsAt < now
        ? ["Ended", "bad"]
        : promotion.startsAt > now
          ? ["Scheduled", "warn"]
          : ["Live", "ok"];
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Offers"
        lead="Coupon codes and automatic savings. At checkout a basket gets the one best offer it qualifies for."
        aside={
          <span className="live-chip">
            <i /> {promotions.filter((item) => state(item)[0] === "Live").length} live
          </span>
        }
      />
      <DataTable
        caption="Offers with their saving, minimum basket, dates, use and status"
        rows={promotions}
        rowKey={(promotion) => String(promotion._id)}
        columns={[
          {
            header: "Offer",
            cell: (promotion) => (
              <span className="product-cell">
                <span>
                  <strong>{promotion.name}</strong>
                  <small>
                    {promotion.code ? (
                      <>
                        Code <span className="offer-code">{promotion.code}</span>
                      </>
                    ) : (
                      "Applied automatically"
                    )}
                  </small>
                </span>
              </span>
            ),
          },
          {
            header: "Saving",
            cell: (promotion) =>
              `${promotion.discountType === "percentage" ? `${promotion.discountValue}% off` : `${formatPrice(promotion.discountValue)} off`}${promotion.maximumDiscountPaise ? `, up to ${formatPrice(promotion.maximumDiscountPaise)}` : ""}`,
          },
          {
            header: "Basket from",
            numeric: true,
            cell: (promotion) => (promotion.minimumSubtotalPaise ? formatPrice(promotion.minimumSubtotalPaise) : "Any"),
          },
          { header: "Runs", cell: (promotion) => `${day(promotion.startsAt)} – ${day(promotion.endsAt)}` },
          { header: "Used", numeric: true, cell: (promotion) => promotion.redemptionCount },
          {
            header: "Status",
            cell: (promotion) => {
              const [label, tone] = state(promotion);
              return <StatusPill tone={tone}>{label}</StatusPill>;
            },
          },
          {
            header: "Action",
            cell: (promotion) => (
              <ActionForm
                action={promotionAdminAction}
                submit={promotion.active ? "Pause offer" : "Switch offer on"}
                buttonClassName="secondary-button compact-button"
                // pausing is undone with one click; switching on hands out discounts, so it asks first
                confirmMessage={
                  promotion.active
                    ? undefined
                    : `Shoppers who qualify will get ${promotion.name} at checkout straight away.`
                }
              >
                <input type="hidden" name="operation" value="toggle" />
                <input type="hidden" name="promotionId" value={String(promotion._id)} />
              </ActionForm>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={TicketPercent}
            title="No offers yet"
            body="Create a coupon code or an automatic saving below."
            heading="h3"
          />
        }
      />
      <details className="panel create-staff" open={!promotions.length}>
        <summary>Create an offer</summary>
        <ActionForm action={promotionAdminAction} submit="Create offer">
          <input type="hidden" name="operation" value="create" />
          <div className="staff-form-grid">
            <label>
              Name <small>For your team; shoppers see the saving</small>
              <input name="name" minLength={3} maxLength={80} required />
            </label>
            <label>
              How shoppers get it
              <select name="kind" defaultValue="code">
                <option value="code">They type a coupon code</option>
                <option value="automatic">Applied automatically</option>
              </select>
            </label>
            <label>
              Coupon code <small>Only for coupon offers; letters and numbers</small>
              <input name="code" maxLength={24} spellCheck={false} autoComplete="off" />
            </label>
            <label>
              Saving
              <select name="discountType" defaultValue="percentage">
                <option value="percentage">A percentage off</option>
                <option value="fixed">A fixed amount off</option>
              </select>
            </label>
            <label>
              How much <small>A percentage like 10, or rupees like 25</small>
              <input name="discountValue" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required autoComplete="off" />
            </label>
            <label>
              Smallest basket (₹) <small>0 for any basket</small>
              <MoneyInput name="minimumSubtotalRupees" defaultValue={0} />
            </label>
            <label>
              Largest saving (₹) <small>Optional cap for percentage offers</small>
              <MoneyInput name="maximumDiscountRupees" required={false} />
            </label>
            <label>
              Starts
              <input name="startsAt" type="datetime-local" defaultValue={istInput(now)} required />
            </label>
            <label>
              Ends
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={istInput(new Date(now.getTime() + 30 * 86400000))}
                required
              />
            </label>
            <label className="checkbox-label field-wide">
              <input name="active" type="checkbox" /> Switch it on straight away
            </label>
          </div>
        </ActionForm>
      </details>
    </section>
  );
}
