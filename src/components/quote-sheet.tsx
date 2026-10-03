"use client";
import { useActionState, useMemo, useState } from "react";
import type { MutationState } from "@/lib/commerce/actions";
import { quoteDeskAction } from "@/lib/schools/actions";
import { GST_RATES } from "@/lib/tax/gst";
import { LIMITS, quoteTotals, type Discount, type Supply } from "@/lib/schools/quote-math";

import { quoteMoney } from "@/lib/schools/display";
import { safeAction } from "./safe-action";
import { useUnsaved } from "./send-when-saved";

export type SheetRow = {
  variantId: string;
  name: string;
  label: string;
  /** What the school asked for. */
  asked: number;
  schoolPricePaise?: number;
  shopPricePaise: number;
  /** Where the starting price came from, for the hint under the line. */
  from: "draft" | "school" | "shop-ex-gst" | "shop-check-rate";
  quantity: number;
  unitPricePaise: number;
  gstRatePercent?: number;
  hsnCode?: string;
};

type Values = {
  rows: { qty: string; price: string; gst: string; hsn: string }[];
  discountType: "none" | "percent" | "amount";
  discountPercent: string;
  discountRupees: string;
  validUntil: string;
  note: string;
};

type SheetState = MutationState & { snapshot?: string };

const rupeeText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));
const MONEY = /^\d+(\.\d{1,2})?$/;
const toPaise = (text: string) => (MONEY.test(text.trim()) ? Math.round(Number(text.trim()) * 100) : Number.NaN);
const toInt = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

const HINT: Record<SheetRow["from"], string | null> = {
  draft: null,
  school: "Started at the school price",
  "shop-ex-gst": "Started at the shop price without GST",
  "shop-check-rate": "Started at the shop price: choose the GST rate and check the price",
};

/**
 * The owner's pricing sheet. Prices are before GST; the totals underneath follow every
 * keystroke with the same arithmetic the server stores, so what you see is what is sent.
 */
export function QuoteSheet({
  requestId,
  rows,
  discountType,
  discountValue,
  validUntil,
  minDate,
  maxDate,
  note,
  supply,
}: {
  requestId: string;
  rows: SheetRow[];
  discountType: Values["discountType"];
  discountValue: number;
  validUntil: string;
  minDate: string;
  maxDate: string;
  note?: string;
  supply: Supply;
}) {
  const [first] = useState<Values>(() => ({
    rows: rows.map((row) => ({
      qty: String(row.quantity),
      price: rupeeText(row.unitPricePaise),
      gst: row.gstRatePercent != null ? String(row.gstRatePercent) : "",
      hsn: row.hsnCode ?? "",
    })),
    discountType,
    discountPercent: discountType === "percent" ? String(discountValue) : "",
    discountRupees: discountType === "amount" ? rupeeText(discountValue) : "",
    validUntil,
    note: note ?? "",
  }));
  const [values, setValues] = useState(first);
  // each save carries a copy of what was on screen; once it succeeds, that copy is "saved"
  const action = useMemo(() => {
    const save = safeAction(quoteDeskAction);
    return async (previous: SheetState, form: FormData): Promise<SheetState> => {
      const result = await save(previous, form);
      return { ...result, snapshot: result.success ? String(form.get("snapshot")) : previous.snapshot };
    };
  }, []);
  const [state, dispatch, pending] = useActionState(action, {});
  const snapshot = JSON.stringify(values);
  const dirty = snapshot !== (state.snapshot ?? JSON.stringify(first));
  useUnsaved("quote-sheet", dirty);

  const setRow = (index: number, key: keyof Values["rows"][number], value: string) =>
    setValues((current) => ({
      ...current,
      rows: current.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));

  const parsed = values.rows.map((row) => ({
    quantity: toInt(row.qty),
    unitPricePaise: toPaise(row.price),
    gstRatePercent: row.gst === "" ? Number.NaN : Number(row.gst),
  }));
  const complete = parsed.every(
    (line) =>
      Number.isInteger(line.quantity) &&
      line.quantity <= LIMITS.quantity &&
      (line.quantity === 0 ||
        (Number.isSafeInteger(line.unitPricePaise) && line.unitPricePaise <= LIMITS.unitPricePaise && !Number.isNaN(line.gstRatePercent))),
  );
  const kept = parsed.filter((line) => line.quantity > 0);
  const discount: Discount =
    values.discountType === "percent"
      ? { type: "percent", percent: Math.min(90, toInt(values.discountPercent) || 0) }
      : values.discountType === "amount"
        ? { type: "amount", paise: toPaise(values.discountRupees) || 0 }
        : { type: "none" };
  const totals = complete && kept.length ? quoteTotals(kept, discount, supply) : null;

  return (
    <form action={dispatch} className="quote-sheet" onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="operation" value="save-draft" />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="snapshot" value={snapshot} />
      <div className="table-scroll data-table sheet-table">
        <table role="table">
          <caption className="sr-only">Pricing sheet: one row per item the school asked for</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                Item
              </th>
              <th role="columnheader" scope="col">
                HSN
              </th>
              <th role="columnheader" scope="col">
                Quantity
              </th>
              <th role="columnheader" scope="col">
                Rate before GST
              </th>
              <th role="columnheader" scope="col">
                GST
              </th>
              <th role="columnheader" scope="col" className="tnum">
                Amount
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row, index) => {
              const value = values.rows[index];
              const line = parsed[index];
              const amount =
                Number.isInteger(line.quantity) && Number.isSafeInteger(line.unitPricePaise)
                  ? line.quantity * line.unitPricePaise
                  : null;
              const id = row.variantId;
              return (
                <tr role="row" key={id} className={line.quantity === 0 ? "dropped" : undefined}>
                  <td role="cell" data-label="Item">
                    <span className="product-cell">
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.label} · asked {row.asked.toLocaleString("en-IN")}
                        </small>
                        <small>
                          School price {row.schoolPricePaise != null ? quoteMoney(row.schoolPricePaise) : "not set"} · shop{" "}
                          {quoteMoney(row.shopPricePaise)} incl. GST
                        </small>
                        {HINT[row.from] && <small className="sheet-hint">{HINT[row.from]}</small>}
                      </span>
                    </span>
                  </td>
                  <td role="cell" data-label="HSN">
                    <label className="sr-only" htmlFor={`hsn-${id}`}>
                      HSN code for {row.name}
                    </label>
                    <input
                      id={`hsn-${id}`}
                      name={`hsn_${id}`}
                      className="sheet-hsn"
                      inputMode="numeric"
                      pattern="\d{4}(\d{2}){0,2}"
                      title="4, 6 or 8 digits"
                      autoComplete="off"
                      value={value.hsn}
                      onChange={(event) => setRow(index, "hsn", event.target.value)}
                    />
                  </td>
                  <td role="cell" data-label="Quantity">
                    <label className="sr-only" htmlFor={`qty-${id}`}>
                      Quantity of {row.name}
                    </label>
                    <input
                      id={`qty-${id}`}
                      name={`qty_${id}`}
                      className="sheet-qty"
                      inputMode="numeric"
                      pattern="[0-9]{1,6}"
                      title="A whole number; 0 leaves it off the quotation"
                      autoComplete="off"
                      required
                      value={value.qty}
                      onChange={(event) => setRow(index, "qty", event.target.value)}
                    />
                  </td>
                  <td role="cell" data-label="Rate before GST">
                    <label className="sr-only" htmlFor={`price-${id}`}>
                      Rate before GST for {row.name}
                    </label>
                    <span className="phone-input money-input">
                      <span aria-hidden="true">₹</span>
                      <input
                        id={`price-${id}`}
                        name={`price_${id}Rupees`}
                        inputMode="decimal"
                        pattern="[0-9]+(\.[0-9]{1,2})?"
                        title="An amount in rupees, like 45 or 45.50"
                        autoComplete="off"
                        spellCheck={false}
                        required={line.quantity !== 0}
                        value={value.price}
                        onChange={(event) => setRow(index, "price", event.target.value)}
                      />
                    </span>
                  </td>
                  <td role="cell" data-label="GST">
                    <label className="sr-only" htmlFor={`gst-${id}`}>
                      GST rate for {row.name}
                    </label>
                    <select
                      id={`gst-${id}`}
                      name={`gst_${id}`}
                      required={line.quantity !== 0}
                      value={value.gst}
                      onChange={(event) => setRow(index, "gst", event.target.value)}
                    >
                      <option value="">Choose</option>
                      {GST_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td role="cell" data-label="Amount" className="tnum">
                    {line.quantity === 0 ? "Left off" : amount != null ? quoteMoney(amount) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sheet-bottom">
        <fieldset className="sheet-terms form-stack">
          <legend>Discount and terms</legend>
          <label>
            Discount
            <select
              name="discountType"
              value={values.discountType}
              onChange={(event) =>
                setValues((current) => ({ ...current, discountType: event.target.value as Values["discountType"] }))
              }
            >
              <option value="none">No discount</option>
              <option value="percent">A percentage</option>
              <option value="amount">An amount in ₹</option>
            </select>
          </label>
          {values.discountType === "percent" && (
            <label>
              Discount % <small>before GST</small>
              <input
                name="discountPercent"
                inputMode="numeric"
                pattern="[0-9]{1,2}"
                title="A whole percent from 1 to 90"
                required
                value={values.discountPercent}
                onChange={(event) => setValues((current) => ({ ...current, discountPercent: event.target.value }))}
              />
            </label>
          )}
          {values.discountType === "amount" && (
            <label>
              Discount <small>before GST, spread over the lines</small>
              <span className="phone-input money-input">
                <span aria-hidden="true">₹</span>
                <input
                  name="discountRupees"
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  title="An amount in rupees"
                  required
                  value={values.discountRupees}
                  onChange={(event) => setValues((current) => ({ ...current, discountRupees: event.target.value }))}
                />
              </span>
            </label>
          )}
          <label>
            Valid until
            <input
              type="date"
              name="validUntil"
              min={minDate}
              max={maxDate}
              required
              value={values.validUntil}
              onChange={(event) => setValues((current) => ({ ...current, validUntil: event.target.value }))}
            />
          </label>
          <label>
            Note on the quotation <small>Optional</small>
            <textarea
              name="note"
              rows={3}
              maxLength={1000}
              placeholder="e.g. Delivery to the school in two lots; prices hold for orders placed by the date above."
              value={values.note}
              onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
            />
          </label>
        </fieldset>

        <div className="sheet-totals form-stack" aria-live="polite">
          <h3>Totals</h3>
          {totals ? (
            <dl className="quotation-totals">
              <div>
                <dt>Items total</dt>
                <dd>{quoteMoney(totals.subtotalPaise)}</dd>
              </div>
              {totals.discountPaise > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{quoteMoney(totals.discountPaise)}</dd>
                </div>
              )}
              <div>
                <dt>Taxable value</dt>
                <dd>{quoteMoney(totals.taxablePaise)}</dd>
              </div>
              {supply === "intra" ? (
                <>
                  <div>
                    <dt>CGST</dt>
                    <dd>{quoteMoney(totals.cgstPaise)}</dd>
                  </div>
                  <div>
                    <dt>SGST</dt>
                    <dd>{quoteMoney(totals.sgstPaise)}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>IGST</dt>
                  <dd>{quoteMoney(totals.igstPaise)}</dd>
                </div>
              )}
              <div className="grand">
                <dt>Total with GST</dt>
                <dd>{quoteMoney(totals.totalPaise)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">
              {kept.length || !complete ? "Fill a rate and GST for every line to see the total." : "Every line is at 0: keep at least one."}
            </p>
          )}
          <p className="muted">{supply === "intra" ? "Same state: CGST + SGST." : "Another state: IGST."}</p>
          {state.error && (
            <p role="alert" className="error-message">
              {state.error}
            </p>
          )}
          {state.success && !dirty && (
            <p role="status" className="success-message">
              {state.success}
            </p>
          )}
          <button className="primary-button" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
    </form>
  );
}
