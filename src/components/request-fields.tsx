import type { ReactNode } from "react";
import { MoneyInput } from "./money-input";
import { GST_RATES } from "@/lib/tax/gst";

/**
 * The fields of a new product and a new pack, shared by Add a product, Add a pack size and an
 * owner's review in Approvals, where they open filled in with what staff asked for. `values` is a
 * request's own record (money in paise); empty when adding something new.
 */
type Values = Record<string, unknown>;
const text = (value: unknown) => (value == null ? undefined : String(value));
const rupees = (value: unknown) => (typeof value === "number" ? value / 100 : undefined);

/** Name, description and how shoppers find it; `children` (the provider picker) sits after the brand. */
export function ProductDetailsFields({
  values = {},
  shelves,
  children,
}: {
  values?: Values;
  shelves: { id: string; name: string }[];
  children?: ReactNode;
}) {
  return (
    <>
      <fieldset className="form-section">
        <legend>Name and description</legend>
        <label>
          Name
          <input name="nameEn" defaultValue={text(values.nameEn)} required />
        </label>
        <label>
          Description
          <textarea name="descriptionEn" defaultValue={text(values.descriptionEn)} required />
        </label>
      </fieldset>
      <fieldset className="form-section">
        <legend>How shoppers find it</legend>
        <div className="staff-form-grid">
          <label>
            Category
            <select name="categoryId" defaultValue={text(values.categoryId)} required>
              {shelves.map((shelf) => (
                <option value={shelf.id} key={shelf.id}>
                  {shelf.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Brand <small>Optional</small>
            <input name="brand" defaultValue={text(values.brand)} />
          </label>
          {children}
          <label>
            Web address <small>Lowercase words joined by dashes, like gel-pen-set</small>
            <input name="slug" defaultValue={text(values.slug)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" spellCheck={false} required />
          </label>
          <label>
            Other words shoppers type <small>Separated by commas, like notebook, diary. Marathi words work too, like वही</small>
            <input name="aliases" defaultValue={text(values.aliases)} />
          </label>
        </div>
      </fieldset>
    </>
  );
}

/**
 * A pack's fields, for the caller's grid. `orderLimit` adds "Most one shopper can buy" (a new pack
 * size has it; a new product's first pack takes the shop's default). School and purchase prices
 * are drawn for owners only, and the server refuses them from anyone else.
 */
export function PackFields({ values = {}, owner, orderLimit }: { values?: Values; owner: boolean; orderLimit?: number }) {
  return (
    <>
      <label>
        Pack label <small>What shoppers see, like “Pack of 10”</small>
        <input name="label" defaultValue={text(values.label)} required />
      </label>
      <label>
        Unit
        <select name="unit" defaultValue={text(values.unit)}>
          {["piece", "kg", "g", "l", "ml"].map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
      </label>
      <label>
        Pack quantity
        <input name="packQuantity" defaultValue={text(values.packQuantity)} inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" required />
      </label>
      <label>
        Selling price (₹)
        <MoneyInput name="priceRupees" defaultValue={rupees(values.pricePaise)} />
      </label>
      <label>
        MRP (₹) <small>The printed price; the saving is worked out from it</small>
        <MoneyInput name="mrpRupees" defaultValue={rupees(values.mrpPaise)} />
      </label>
      {orderLimit !== undefined && (
        <label>
          Most one shopper can buy
          <input name="maxQuantity" inputMode="numeric" pattern="[0-9]+" defaultValue={orderLimit} required />
        </label>
      )}
      <label>
        Opening stock
        <input name="stock" defaultValue={text(values.stock)} inputMode="numeric" pattern="[0-9]+" required />
      </label>
      {owner && (
        <label>
          School price before GST (₹) <small>Optional: what schools see as the expected price</small>
          <MoneyInput name="schoolPriceRupees" defaultValue={rupees(values.schoolPricePaise)} required={false} />
        </label>
      )}
      {owner && (
        <label>
          Purchase price (₹) <small>Optional; only owners see it, for profit</small>
          <MoneyInput name="costRupees" defaultValue={rupees(values.costPaise)} required={false} />
        </label>
      )}
    </>
  );
}

/** Who sees the product, and its tax details. */
export function AudienceAndTaxFields({ values = {} }: { values?: Values }) {
  return (
    <>
      <fieldset className="form-section">
        <legend>Who can see it</legend>
        <label className="checkbox-label">
          <input type="checkbox" name="showToCustomers" defaultChecked={values.showToCustomers !== false} /> Customers
          <small>In the shop, search, baskets and wishlists</small>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="showToSchools" defaultChecked={values.showToSchools === true} /> Schools
          <small>In the school catalogue, for quotations</small>
        </label>
      </fieldset>
      <fieldset className="form-section">
        <legend>
          Tax <small>Printed on school quotations; can be added later</small>
        </legend>
        <div className="staff-form-grid">
          <label>
            GST rate
            <select name="gstRatePercent" defaultValue={text(values.gstRatePercent) ?? ""}>
              <option value="">Not set</option>
              {GST_RATES.map((rate) => (
                <option value={rate} key={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </label>
          <label>
            HSN code <small>4, 6 or 8 digits</small>
            <input
              name="hsnCode"
              defaultValue={text(values.hsnCode)}
              inputMode="numeric"
              pattern="[0-9]{4}([0-9]{2}){0,2}"
              maxLength={8}
              autoComplete="off"
            />
          </label>
        </div>
      </fieldset>
    </>
  );
}
