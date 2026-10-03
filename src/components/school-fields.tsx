import { GST_STATES } from "@/lib/tax/gst";

type SchoolDetails = {
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  pin?: string;
  stateCode?: string;
  gstin?: string;
  notes?: string;
};

/** A school's details, for adding a school and for editing one. Only the name is required. */
export function SchoolFields({ school = {} }: { school?: SchoolDetails }) {
  return (
    <div className="staff-form-grid">
      <label className="field-wide">
        School name
        <input name="name" defaultValue={school.name} minLength={2} maxLength={120} required />
      </label>
      <label>
        Contact person <small>Optional</small>
        <input name="contactName" defaultValue={school.contactName} maxLength={80} />
      </label>
      <label>
        Phone <small>Optional</small>
        <input name="phone" defaultValue={school.phone} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} />
      </label>
      <label>
        Email <small>Optional; the school office</small>
        <input name="email" type="email" defaultValue={school.email} maxLength={120} />
      </label>
      <label>
        PIN code <small>Optional</small>
        <input name="pin" defaultValue={school.pin} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} />
      </label>
      <label className="field-wide">
        Billing address <small>Optional; printed on quotations</small>
        <textarea name="address" defaultValue={school.address} maxLength={300} />
      </label>
      <label>
        State <small>Another state gets IGST instead of CGST + SGST</small>
        <select name="stateCode" defaultValue={school.stateCode ?? ""}>
          <option value="">Not set (same state as the shop)</option>
          {GST_STATES.map((state) => (
            <option value={state.code} key={state.code}>
              {state.name} ({state.code})
            </option>
          ))}
        </select>
      </label>
      <label>
        GSTIN <small>Optional; many schools have none</small>
        <input
          name="gstin"
          defaultValue={school.gstin}
          maxLength={15}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="field-wide">
        Notes for you <small>Never shown to the school</small>
        <textarea name="notes" defaultValue={school.notes} maxLength={1000} />
      </label>
    </div>
  );
}
