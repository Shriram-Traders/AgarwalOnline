import { SHOP_STATE, stateName } from "@/lib/tax/gst";
import { quoteDate, quoteMoney } from "@/lib/schools/display";
import { istDate } from "@/lib/commerce/delivery";

type Party = {
  name?: string;
  gstin?: string;
  address?: string;
  pin?: string;
  stateCode?: string;
  phone?: string;
  email?: string;
  terms?: string;
};
export type QuotationVersion = {
  version: number;
  sentAt: Date | string;
  validUntil: string;
  note?: string;
  supply: "intra" | "inter";
  seller?: Party;
  buyer?: Party;
  lines: {
    name: string;
    label: string;
    hsnCode?: string;
    gstRatePercent: number;
    quantity: number;
    unitPricePaise: number;
    amountPaise: number;
    discountPaise: number;
    taxablePaise: number;
  }[];
  taxes: { ratePercent: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  discountLabel?: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

const state = (code?: string) => (code ? `${stateName(code) ?? "State"} (${code})` : undefined);

/**
 * One sent quotation, laid out like the paper ones schools file: who from, who for, the lines
 * with HSN and GST, a tax summary by rate and the terms. It prints on its own (see print CSS).
 */
export function QuotationDocument({ number, quote }: { number: string; quote: QuotationVersion }) {
  const seller = quote.seller ?? {};
  const buyer = quote.buyer ?? {};
  const intra = quote.supply === "intra";
  const discounted = quote.discountPaise > 0;
  const buyerState = buyer.stateCode;
  return (
    <article className="quotation" aria-label={`Quotation ${number}, version ${quote.version}`}>
      <header className="quotation-head">
        <div className="quotation-from">
          <strong className="quotation-seller">{seller.name}</strong>
          {seller.address && <p>{seller.address}</p>}
          {state(seller.stateCode) && <p>{state(seller.stateCode)}</p>}
          <p>{seller.gstin ? `GSTIN ${seller.gstin}` : "GSTIN not added yet"}</p>
          {(seller.phone || seller.email) && <p>{[seller.phone, seller.email].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="quotation-meta">
          <h2>Quotation</h2>
          <dl>
            <div>
              <dt>Number</dt>
              <dd>
                {number}
                {quote.version > 1 ? ` · version ${quote.version}` : ""}
              </dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{quoteDate(istDate(new Date(quote.sentAt)))}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{quoteDate(quote.validUntil)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="quotation-parties">
        <div>
          <h3>Quotation for</h3>
          <strong>{buyer.name}</strong>
          {buyer.address && <p>{[buyer.address, buyer.pin].filter(Boolean).join(" ")}</p>}
          <p>{buyer.gstin ? `GSTIN ${buyer.gstin}` : "GSTIN not given"}</p>
          {(buyer.phone || buyer.email) && <p>{[buyer.phone, buyer.email].filter(Boolean).join(" · ")}</p>}
        </div>
        <div>
          <h3>Place of supply</h3>
          <p>
            {buyerState ? state(buyerState) : `${state(seller.stateCode ?? SHOP_STATE)}, as no state was given`}
          </p>
          <p className="muted">{intra ? "Within the state: CGST + SGST" : "Another state: IGST"}</p>
        </div>
      </section>

      <div className="table-scroll quotation-table">
        <table>
          <caption className="sr-only">Items quoted</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Item</th>
              <th scope="col">HSN</th>
              <th scope="col" className="tnum">
                Qty
              </th>
              <th scope="col" className="tnum">
                Rate
              </th>
              {discounted && (
                <th scope="col" className="tnum">
                  Discount
                </th>
              )}
              <th scope="col" className="tnum">
                Taxable value
              </th>
              <th scope="col" className="tnum">
                GST
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={`${line.name}-${line.label}-${index}`}>
                <td data-label="#">{index + 1}</td>
                <td data-label="Item">
                  <strong>{line.name}</strong>
                  <small>{line.label}</small>
                </td>
                <td data-label="HSN">{line.hsnCode ?? "–"}</td>
                <td data-label="Qty" className="tnum">
                  {line.quantity.toLocaleString("en-IN")}
                </td>
                <td data-label="Rate" className="tnum">
                  {quoteMoney(line.unitPricePaise)}
                </td>
                {discounted && (
                  <td data-label="Discount" className="tnum">
                    {line.discountPaise ? `−${quoteMoney(line.discountPaise)}` : "–"}
                  </td>
                )}
                <td data-label="Taxable value" className="tnum">
                  {quoteMoney(line.taxablePaise)}
                </td>
                <td data-label="GST" className="tnum">
                  {line.gstRatePercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quotation-foot">
        <div className="table-scroll quotation-tax">
          <table>
            <caption>GST by rate</caption>
            <thead>
              <tr>
                <th scope="col">Rate</th>
                <th scope="col" className="tnum">
                  Taxable value
                </th>
                {intra ? (
                  <>
                    <th scope="col" className="tnum">
                      CGST
                    </th>
                    <th scope="col" className="tnum">
                      SGST
                    </th>
                  </>
                ) : (
                  <th scope="col" className="tnum">
                    IGST
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {quote.taxes.map((row) => (
                <tr key={row.ratePercent}>
                  <td>{row.ratePercent}%</td>
                  <td className="tnum">{quoteMoney(row.taxablePaise)}</td>
                  {intra ? (
                    <>
                      <td className="tnum">{quoteMoney(row.cgstPaise)}</td>
                      <td className="tnum">{quoteMoney(row.sgstPaise)}</td>
                    </>
                  ) : (
                    <td className="tnum">{quoteMoney(row.igstPaise)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="quotation-totals">
          <div>
            <dt>Items total</dt>
            <dd>{quoteMoney(quote.subtotalPaise)}</dd>
          </div>
          {discounted && (
            <div>
              <dt>{quote.discountLabel ?? "Discount"}</dt>
              <dd>−{quoteMoney(quote.discountPaise)}</dd>
            </div>
          )}
          <div>
            <dt>Taxable value</dt>
            <dd>{quoteMoney(quote.taxablePaise)}</dd>
          </div>
          {intra ? (
            <>
              <div>
                <dt>CGST</dt>
                <dd>{quoteMoney(quote.cgstPaise)}</dd>
              </div>
              <div>
                <dt>SGST</dt>
                <dd>{quoteMoney(quote.sgstPaise)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>IGST</dt>
              <dd>{quoteMoney(quote.igstPaise)}</dd>
            </div>
          )}
          <div className="grand">
            <dt>Total with GST</dt>
            <dd>{quoteMoney(quote.totalPaise)}</dd>
          </div>
        </dl>
      </div>

      {quote.note && (
        <section className="quotation-note">
          <h3>Note from the store</h3>
          <p>{quote.note}</p>
        </section>
      )}
      {seller.terms && (
        <section className="quotation-note">
          <h3>Terms</h3>
          <p>{seller.terms}</p>
        </section>
      )}
      <footer className="quotation-legal">
        <p>This is a quotation, not a tax invoice. Amounts are in Indian rupees.</p>
        {!seller.gstin && <p>The store’s GSTIN will be shown once it is added.</p>}
      </footer>
    </article>
  );
}
