import { requirePage } from "@/lib/auth/session";
import { MapPinPlus } from "lucide-react";
import { Address } from "@/lib/commerce/models";
import { ServiceArea } from "@/lib/db/models";
import { addressAction } from "@/lib/commerce/actions";
import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { User } from "@/lib/db/models";
import { ClaimPhone } from "@/components/claim-phone";
import { PolicyNotice } from "@/components/policy-notice";
export const metadata = { title: "Saved addresses", robots: { index: false } };
export default async function Addresses({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string }>;
}) {
  const user = await requirePage("order:own");
  const addresses = await Address.find({ customerId: user.id }).sort({ isDefault: -1, createdAt: -1 });
  // after "Also use this number to sign in": the code went to the newest address's number
  const newest = await Address.findOne({ customerId: user.id }).sort({ createdAt: -1 }).select("phone");
  const verifying =
    !user.phone && (await searchParams).verify === "1" && newest
      ? {
          phone: newest.phone,
          newAccount: !(await User.exists({ phone: newest.phone, _id: { $ne: user.id } })),
        }
      : undefined;
  const areas = await ServiceArea.find({ enabled: true });
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div><span className="eyebrow">DELIVERY DETAILS</span><h1>Your addresses</h1><p>Save trusted addresses and choose your default for faster checkout.</p></div>
        <Link className="secondary-button" href="/account">Back to account</Link>
      </div>
      {verifying && <ClaimPhone context="address" initial={verifying} />}
      <div className="basket-layout">
        <div>
          {addresses.map((a) => (
            <details className="panel address-card" key={String(a._id)}>
              <summary>
                <span>
                  <strong>{a.name}</strong>
                  {a.isDefault && <span className="status-pill">Default</span>}
                  <small>
                    {a.line} · {a.pin}
                  </small>
                </span>
                <span>Edit</span>
              </summary>
              <ActionForm action={addressAction} submit="Update address">
                <input type="hidden" name="operation" value="update" />
                <input type="hidden" name="addressId" value={String(a._id)} />
                <label>
                  Recipient name
                  <input name="name" defaultValue={a.name} required />
                </label>
                <label>
                  Mobile number
                  <input
                    name="phone"
                    defaultValue={a.phone}
                    pattern="[6-9][0-9]{9}"
                    required
                  />
                </label>
                <label>
                  House, building, street
                  <input
                    name="line"
                    defaultValue={a.line}
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  Service area
                  <select name="areaId" defaultValue={String(a.areaId)}>
                    {areas.map((area) => (
                      <option value={String(area._id)} key={String(area._id)}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  PIN code
                  <input
                    name="pin"
                    defaultValue={a.pin}
                    pattern="[0-9]{6}"
                    required
                  />
                </label>
                <label>
                  Delivery instructions
                  <textarea
                    name="instructions"
                    defaultValue={a.instructions}
                    maxLength={300}
                  />
                </label>
                <label><input type="checkbox" name="isDefault" defaultChecked={a.isDefault} /> Use as my default address</label>
                <PolicyNotice kind="address" />
              </ActionForm>
              <ActionForm
                action={addressAction}
                submit="Remove address"
                className="danger-form"
                confirmMessage="Remove this saved delivery address?"
              >
                <input type="hidden" name="operation" value="delete" />
                <input type="hidden" name="addressId" value={String(a._id)} />
              </ActionForm>
            </details>
          ))}
          {!addresses.length && <div className="panel empty-state"><MapPinPlus size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" /><h2>No saved addresses</h2><p>Add your first delivery address using the form.</p></div>}
        </div>
        <div className="panel">
          <h2>Add an address</h2>
          {areas.length ? (
            <ActionForm action={addressAction} submit="Save address">
              <input type="hidden" name="operation" value="create" />
              <label>
                Recipient name
                <input name="name" minLength={2} maxLength={80} required />
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
                  defaultValue={user.phone}
                  required
                />
              </label>
              {!user.phone && (
                <label className="checkbox-label">
                  <input type="checkbox" name="useForSignIn" /> Also use this number to sign in
                  <small className="muted">We’ll send a code to check it. If it already has an account with us, that account’s orders come across.</small>
                </label>
              )}
              <label>
                House, building, street
                <input name="line" minLength={8} maxLength={250} required />
              </label>
              <label>
                Service area
                <select name="areaId">
                  {areas.map((a) => (
                    <option value={String(a._id)} key={String(a._id)}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                PIN code
                <input name="pin" pattern="[0-9]{6}" maxLength={6} required />
              </label>
              <label>
                Delivery instructions
                <textarea name="instructions" maxLength={300} />
              </label>
              <label><input type="checkbox" name="isDefault" defaultChecked={!addresses.length} /> Use as my default address</label>
              <PolicyNotice kind="address" />
            </ActionForm>
          ) : (
            <p>
              Delivery areas are awaiting store configuration. Address creation
              will be available when service is enabled.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
