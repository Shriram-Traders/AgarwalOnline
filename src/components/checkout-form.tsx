"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionForm } from "./action-form";
import { checkoutAction } from "@/lib/commerce/actions";
import { formatPrice } from "@/lib/display";
type Option = {
  id: string;
  label: string;
  areaId: string;
  fee: number;
  codLimit: number;
  codEnabled: boolean;
};
export function CheckoutForm({
  addresses,
  slots,
  subtotal,
  threshold,
  promotionDiscount = 0,
  promotionName,
  defaultAddressId,
  defaultMethod = "cod",
  idempotencyKey,
  onlineEnabled = false,
  coupons,
  people,
  defaultFor,
  tab,
}: {
  addresses: Option[];
  slots: { id: string; areaId: string; label: string }[];
  subtotal: number;
  threshold: number;
  promotionDiscount?: number;
  promotionName?: string;
  defaultAddressId?: string;
  defaultMethod?: "cod" | "razorpay";
  idempotencyKey: string;
  onlineEnabled?: boolean;
  /** The coupon preview, rendered on the server. */
  coupons?: React.ReactNode;
  /** The buyer's family, adults then children; absent when they have none. */
  people?: { id: string; label: string }[];
  defaultFor?: string;
  /** The family tab: what is left on it, or why it can't be used right now. */
  tab?: { availablePaise: number; blocked?: string };
}) {
  const [method, setMethod] = useState(
    defaultMethod === "razorpay" && onlineEnabled ? "razorpay" : "cod",
  );
  const [addressId, setAddressId] = useState(
    defaultAddressId ?? addresses[0]?.id ?? "",
  );
  const a = addresses.find((a) => a.id === addressId);
  const available = slots.filter((s) => s.areaId === a?.areaId);
  const fee = subtotal >= threshold ? 0 : (a?.fee ?? 0);
  const codBlocked = method === "cod" && a && (!a.codEnabled || subtotal + fee > a.codLimit);
  const total = subtotal - promotionDiscount + fee;
  const overTab = method === "tab" && tab && total > tab.availablePaise;
  return (
    <ActionForm
      action={checkoutAction}
      className="form-stack checkout-form"
      // the same order key goes with every retry, so a second tap finds the first order instead of placing another
      offlineMessage="We couldn’t hear back from the store, so your order may or may not have gone through. Tap the button again: the same order is never placed twice."
      // no delivery time to pick: the button could only fail, and the page says why
      disabled={!available.length}
      submit={
        method === "cod"
          ? "Confirm Cash on Delivery order"
          : method === "tab"
            ? "Put this order on the family tab"
            : "Reserve order & continue to payment"
      }
    >
      <div className="checkout-fields">
        <div className="panel">
          <h2>Delivery</h2>
          <label>
            Delivery address
            <select
              name="addressId"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              required
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            <Link href="/account/addresses">Manage saved addresses</Link>
          </p>
          <label>
            Delivery slot
            {/* the earliest window is the likely one; up to 14 days of windows stay a list */}
            <select key={addressId} name="slotId" required defaultValue={available[0]?.id ?? ""}>
              {!available.length && <option value="">No delivery windows open</option>}
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p className="error-message" role="status">
              No delivery times are open for this address right now, so the order can’t be placed yet.
              Please try again later, choose another address, or{" "}
              <Link href="/account/support">ask the store</Link>.
            </p>
          )}
          {people && (
            <label>
              Who is it for?
              <select name="forId" defaultValue={defaultFor}>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
                <option value="">Whole family</option>
                <option value="private">Private (keep out of family spend)</option>
              </select>
              <small className="muted">Shows under this person in Family spend.</small>
            </label>
          )}
        </div>
        <div className="panel">
          <h2>Payment</h2>
          {/* every way to pay is visible at once, each with what it means */}
          <fieldset className="day-picker pay-choices">
            <legend>Payment method</legend>
            {[
              { value: "cod", label: "Cash on Delivery", note: "Pay the delivery partner in cash when your order arrives.", show: true },
              { value: "razorpay", label: "Pay online with Razorpay", note: "Your items are held for 15 minutes while you complete payment.", show: onlineEnabled },
              {
                value: "tab",
                label: `Add to family tab (${formatPrice(tab?.availablePaise ?? 0)} left)`,
                note: "Nothing to pay now. It goes on the family tab, settled with the store once a month.",
                show: Boolean(tab && !tab.blocked),
              },
            ]
              .filter((choice) => choice.show)
              .map((choice) => (
                <label key={choice.value} className="checkbox-label">
                  <input
                    type="radio"
                    name="method"
                    value={choice.value}
                    checked={method === choice.value}
                    onChange={() => setMethod(choice.value)}
                  />
                  {choice.label}
                  <small>{choice.note}</small>
                </label>
              ))}
          </fieldset>
          {tab?.blocked && <p className="muted">{tab.blocked}</p>}
          {overTab && (
            <p className="error-message">
              This basket is over what is left on your family tab ({formatPrice(tab.availablePaise)}).
            </p>
          )}
          {codBlocked && (
            <p className="error-message">Cash on Delivery is unavailable for this order.</p>
          )}
        </div>
      </div>
      <aside className="panel checkout-summary">
        <h2>Order summary</h2>
        <p>
          Merchandise <strong>{formatPrice(subtotal)}</strong>
        </p>
        {promotionDiscount > 0 && (
          <p className="savings-line">
            {promotionName ?? "Offer"} <strong>−{formatPrice(promotionDiscount)}</strong>
          </p>
        )}
        {coupons}
        <p>
          Delivery <strong>{fee ? formatPrice(fee) : "FREE"}</strong>
        </p>
        <h3 className="summary-total">
          {method === "cod" ? "Total to collect" : method === "tab" ? "Total on the tab" : "Total to pay"}:{" "}
          {formatPrice(total)}
        </h3>
        {/* only cash asks twice: a no-show costs the shop a trip; the button names everything else */}
        {method === "cod" && (
          <label className="checkbox-label">
            <input type="checkbox" required />
            I confirm this order and will pay cash on delivery.
          </label>
        )}
        <p className="muted">Prices and availability are checked again when you confirm.</p>
      </aside>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </ActionForm>
  );
}
