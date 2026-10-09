"use client";
import { useState } from "react";
import Link from "next/link";
import { MapPinPlus } from "lucide-react";
import { ActionForm } from "./action-form";
import { Modal } from "./modal";
import { addressAction } from "@/lib/commerce/actions";
import { PolicyNotice } from "./policy-notice";

type Area = { id: string; name: string; pincodes: string[] };

/**
 * Checkout with no address we can deliver to: the address form pops up over the page, and
 * saving it comes straight back to checkout with the new address picked. Closing it leaves
 * a button on the page to bring it back.
 */
export function AddressPopup({
  areas,
  phone,
  hasAddresses,
}: {
  areas: Area[];
  phone?: string;
  /** Saved addresses exist, but none is in an area we deliver to. */
  hasAddresses: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [pin, setPin] = useState("");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const title = hasAddresses ? "Add an address we deliver to" : "Where should we deliver?";
  const lead = hasAddresses
    ? "None of your saved addresses is in an area we deliver to yet. Add one that is, and you’ll go straight on to choosing a delivery time."
    : "Add your delivery address to place this order. It’s saved for next time.";
  const pinArea = pin.length === 6 ? areas.find((area) => area.pincodes.includes(pin)) : undefined;
  return (
    <div className="panel empty-state">
      <MapPinPlus size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{lead}</p>
      {areas.length > 0 && (
        <button type="button" className="primary-button" onClick={() => setOpen(true)}>
          Add delivery address
        </button>
      )}
      <Link href="/account/addresses" className="text-button">
        Manage saved addresses
      </Link>
      {open && (
        <Modal eyebrow="Delivery address" title={title} onClose={() => setOpen(false)}>
          {areas.length ? (
            <>
              <p className="muted">{lead}</p>
              <ActionForm action={addressAction} submit="Save address & continue" className="form-stack address-form">
                <input type="hidden" name="operation" value="create" />
                <input type="hidden" name="then" value="/checkout" />
                <input type="hidden" name="isDefault" value="on" />
                <label>
                  Recipient name
                  <input name="name" minLength={2} maxLength={80} autoComplete="name" required />
                </label>
                <label>
                  Mobile number
                  <input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    autoComplete="tel-national"
                    defaultValue={phone}
                    required
                  />
                </label>
                <label>
                  House, building, street
                  <input name="line" minLength={8} maxLength={250} autoComplete="street-address" required />
                </label>
                <div className="address-form-pair">
                  <label>
                    PIN code
                    <input
                      name="pin"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="postal-code"
                      value={pin}
                      onChange={(event) => {
                        const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setPin(next);
                        // the PIN usually says which area it is, so pick it for them
                        const match = next.length === 6 && areas.find((area) => area.pincodes.includes(next));
                        if (match) setAreaId(match.id);
                      }}
                      required
                    />
                  </label>
                  <label>
                    Area
                    <select name="areaId" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
                      {areas.map((area) => (
                        <option value={area.id} key={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {pin.length === 6 && !pinArea && (
                  <p className="error-message" role="status">
                    We don’t deliver to PIN {pin} yet. We deliver to{" "}
                    {areas.map((area) => `${area.name} (${area.pincodes.join(", ")})`).join("; ")}.
                  </p>
                )}
                <label>
                  Delivery instructions <small className="muted">Optional: a landmark, gate or floor</small>
                  <textarea name="instructions" maxLength={300} rows={2} />
                </label>
                <PolicyNotice kind="address" />
              </ActionForm>
            </>
          ) : (
            <p>
              We aren’t taking deliveries just yet: the store is still setting up its delivery areas. Please check
              back soon, or <Link href="/account/support">ask the store</Link>.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
