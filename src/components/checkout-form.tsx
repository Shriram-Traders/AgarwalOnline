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
            <select key={addressId} name="slotId" required defaultValue="">
              <option value="" disabled>
                Select a delivery window
              </option>
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
        </div>
        <div className="panel">
          <h2>Payment</h2>
          <label>
            Payment method
            <select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cod">Cash on Delivery</option>
              {onlineEnabled && <option value="razorpay">Pay online with Razorpay</option>}
            </select>
          </label>
          <p className="muted">
            {method === "cod"
              ? "Pay the delivery partner in cash when your order arrives."
              : "Your items are held for 15 minutes while you complete payment."}
          </p>
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
        <p className="checkout-offer-link">
          <Link href="/cart#offers">{promotionDiscount > 0 ? "Change offer" : "Have an offer code?"}</Link>
        </p>
        <p>
          Delivery <strong>{fee ? formatPrice(fee) : "FREE"}</strong>
        </p>
        <h3 className="summary-total">
          {method === "cod" ? "Total to collect" : "Total to pay"}:{" "}
          {formatPrice(subtotal - promotionDiscount + fee)}
        </h3>
        <label className="checkbox-label">
          <input type="checkbox" required />
          {method === "cod"
            ? "I confirm this order and will pay cash on delivery."
            : "I confirm this order and will complete payment online."}
        </label>
        <p className="muted">Prices and availability are checked again when you confirm.</p>
      </aside>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </ActionForm>
  );
}
