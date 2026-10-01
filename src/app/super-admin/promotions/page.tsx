import Link from "next/link";
import mongoose from "mongoose";
import { Plus, TicketPercent } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { formatPrice } from "@/lib/display";
import { Promotion } from "@/lib/promotions/models";
import { promotionAdminAction } from "@/lib/promotions/actions";
import { offerSaving } from "@/lib/promotions/service";
import { ActionForm } from "@/components/action-form";
import { MoneyInput } from "@/components/money-input";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { RecordHistory } from "@/components/record-history";
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

type Offer = {
  _id: unknown;
  name: string;
  code?: string;
  kind: "code" | "automatic";
  discountType: "fixed" | "percentage";
  discountValue: number;
  minimumSubtotalPaise: number;
  maximumDiscountPaise?: number;
  perCustomerLimit: number;
  globalLimit?: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  welcome?: boolean;
  listed?: boolean;
};

function OfferFields({ offer, now }: { offer?: Offer; now: Date }) {
  return (
    <div className="staff-form-grid">
      <label>
        Name <small>For your team; shoppers see the saving</small>
        <input name="name" defaultValue={offer?.name} minLength={3} maxLength={80} required />
      </label>
      <label>
        How shoppers get it
        <select name="kind" defaultValue={offer?.kind ?? "code"}>
          <option value="code">They type a coupon code</option>
          <option value="automatic">Applied automatically</option>
        </select>
      </label>
      <label>
        Coupon code <small>Only for coupon offers: 3–24 letters, numbers or dashes</small>
        <input
          name="code"
          defaultValue={offer?.code}
          maxLength={24}
          pattern="[A-Za-z0-9-]{3,24}"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label>
        Saving
        <select name="discountType" defaultValue={offer?.discountType ?? "percentage"}>
          <option value="percentage">A percentage off</option>
          <option value="fixed">A fixed amount off</option>
        </select>
      </label>
      <label>
        How much <small>A percentage from 1 to 90, or rupees like 25</small>
        <input
          name="discountValue"
          defaultValue={
            offer ? (offer.discountType === "fixed" ? offer.discountValue / 100 : offer.discountValue) : undefined
          }
          inputMode="numeric"
          pattern="[0-9]{1,5}"
          required
          autoComplete="off"
        />
      </label>
      <label>
        Smallest basket (₹) <small>0 for any basket</small>
        <MoneyInput name="minimumSubtotalRupees" defaultValue={(offer?.minimumSubtotalPaise ?? 0) / 100} />
      </label>
      <label>
        Largest saving (₹) <small>Optional cap for percentage offers</small>
        <MoneyInput
          name="maximumDiscountRupees"
          defaultValue={offer?.maximumDiscountPaise ? offer.maximumDiscountPaise / 100 : undefined}
          required={false}
        />
      </label>
      <label>
        Uses per customer
        <input
          name="perCustomerLimit"
          defaultValue={offer?.perCustomerLimit ?? 1}
          inputMode="numeric"
          pattern="[0-9]{1,3}"
          required
        />
      </label>
      <label>
        Total uses <small>Optional: stop after this many orders</small>
        <input name="globalLimit" defaultValue={offer?.globalLimit} inputMode="numeric" pattern="[0-9]{1,7}" />
      </label>
      <label>
        Starts
        <input name="startsAt" type="datetime-local" defaultValue={istInput(offer?.startsAt ?? now)} required />
      </label>
      <label>
        Ends
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={istInput(offer?.endsAt ?? new Date(now.getTime() + 30 * 86400000))}
          required
        />
      </label>
      <label className="checkbox-label field-wide">
        <input name="active" type="checkbox" defaultChecked={offer?.active ?? false} /> Switched on
      </label>
      <label className="checkbox-label field-wide">
        <input name="welcome" type="checkbox" defaultChecked={offer?.welcome ?? false} /> Show this code in the
        top bar as the welcome offer <small>Coupon offers only; replaces any other welcome offer</small>
      </label>
      <label className="checkbox-label field-wide">
        <input name="listed" type="checkbox" defaultChecked={offer?.listed ?? true} /> List this code in the
        basket under “Offers from the shop”{" "}
        <small>Untick for a private code you hand out yourself; it still works when typed</small>
      </label>
    </div>
  );
}

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requirePage("promotion:write");
  const { edit } = await searchParams;
  const promotions = (await Promotion.find({}).sort({ createdAt: -1 }).limit(200)) as unknown as (Offer & {
    redemptionCount: number;
  })[];
  const now = new Date();
  const editing =
    edit === "new" ? "new" : edit && mongoose.isValidObjectId(edit) ? promotions.find((item) => String(item._id) === edit) : undefined;
  const state = (promotion: Offer): [string, Tone] =>
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
          <Link href="/super-admin/promotions?edit=new#offer" className="primary-button">
            <Plus size={16} aria-hidden="true" /> Create an offer
          </Link>
        }
      />
      {editing && (
        <div className="panel adjust-panel" id="offer">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editing === "new" ? "New offer" : "Edit offer"}</span>
              <h2>{editing === "new" ? "Create an offer" : editing.name}</h2>
            </div>
            <Link href="/super-admin/promotions" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm
            action={promotionAdminAction}
            submit={editing === "new" ? "Create offer" : "Save offer"}
            confirmMessage="If the offer is switched on, shoppers who qualify get it at checkout straight away."
          >
            <input type="hidden" name="operation" value={editing === "new" ? "create" : "update"} />
            {editing !== "new" && <input type="hidden" name="promotionId" value={String(editing._id)} />}
            <OfferFields offer={editing === "new" ? undefined : editing} now={now} />
          </ActionForm>
          {editing !== "new" && (
            <>
              <ActionForm
                action={promotionAdminAction}
                submit="Delete offer"
                className="form-stack inline-grant"
                buttonClassName="secondary-button"
                confirmMessage="Offers people have used can’t be deleted; pause them instead."
              >
                <input type="hidden" name="operation" value="delete" />
                <input type="hidden" name="promotionId" value={String(editing._id)} />
              </ActionForm>
              <RecordHistory target={String(editing._id)} title="Changes to this offer" />
            </>
          )}
        </div>
      )}
      <p className="results-line">
        <span>
          <strong>{promotions.filter((item) => state(item)[0] === "Live").length}</strong> live of {promotions.length}{" "}
          offers
        </span>
      </p>
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
                  <Link href={`/super-admin/promotions?edit=${promotion._id}#offer`}>
                    <strong>{promotion.name}</strong>
                  </Link>
                  <small>
                    {promotion.code ? (
                      <>
                        Code <span className="offer-code">{promotion.code}</span>
                        {promotion.welcome ? " · welcome offer" : ""}
                        {promotion.listed === false ? " · private, not listed" : ""}
                      </>
                    ) : (
                      "Applied automatically"
                    )}
                  </small>
                </span>
              </span>
            ),
          },
          { header: "Saving", cell: (promotion) => offerSaving(promotion) },
          {
            header: "Basket from",
            numeric: true,
            cell: (promotion) => (promotion.minimumSubtotalPaise ? formatPrice(promotion.minimumSubtotalPaise) : "Any"),
          },
          { header: "Runs", cell: (promotion) => `${day(promotion.startsAt)} – ${day(promotion.endsAt)}` },
          {
            header: "Used",
            numeric: true,
            cell: (promotion) =>
              `${promotion.redemptionCount}${promotion.globalLimit ? ` of ${promotion.globalLimit}` : ""} · ${promotion.perCustomerLimit}× each`,
          },
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
                className="form-stack inline-grant"
                buttonClassName="secondary-button compact-button"
                // pausing is undone with one click; switching on hands out discounts, so it asks first
                confirmMessage={
                  promotion.active ? undefined : `Shoppers who qualify will get ${promotion.name} at checkout straight away.`
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
            body="Create a coupon code or an automatic saving."
            heading="h3"
            action={
              <Link href="/super-admin/promotions?edit=new#offer" className="primary-button">
                Create an offer
              </Link>
            }
          />
        }
      />
    </section>
  );
}
