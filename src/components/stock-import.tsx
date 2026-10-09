"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { applyStockImportAction, previewStockImportAction } from "@/lib/inventory/actions";
import type { ImportPlan, ImportResult, ImportRow } from "@/lib/inventory/import";
import { CONNECTION_ERROR } from "./safe-action";

const OUTCOME: Record<ImportRow["outcome"], string> = {
  apply: "Changes now",
  approval: "Waits for an owner",
  same: "No change",
  error: "Can’t be used",
};

/**
 * Stock for many packs at once: download the sheet, fill in a Count (what's on the shelf) or a
 * Change for the packs that moved, upload it, check what each row will do, then apply. Every row
 * goes through the same change as the form above, so big ones still wait for an owner.
 */
export function StockImport() {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<(ImportPlan & { error?: string }) | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const usable = plan?.rows.filter((row) => row.outcome === "apply" || row.outcome === "approval") ?? [];
  const shown = plan?.rows.filter((row) => row.outcome !== "same") ?? [];
  const count = (outcome: ImportRow["outcome"]) => plan?.rows.filter((row) => row.outcome === outcome).length ?? 0;

  const check = () =>
    start(async () => {
      if (!file) return;
      setResult(null);
      setConfirming(false);
      const next = await previewStockImportAction({ text: file.text, reason }).catch(
        (): ImportPlan & { error?: string } => ({ rows: [], error: CONNECTION_ERROR }),
      );
      setPlan(next);
      setError(next.error ?? next.problem);
    });
  const apply = () =>
    start(async () => {
      if (!file) return;
      const outcome = await applyStockImportAction({ text: file.text, reason }).catch(() => ({ error: CONNECTION_ERROR }));
      setConfirming(false);
      if ("result" in outcome && outcome.result) {
        setResult(outcome.result);
        setPlan(null);
        setError(undefined);
        router.refresh();
      } else setError(outcome.error);
    });

  return (
    <div className="stock-import">
      <ol className="stock-import-steps">
        <li>
          <a className="secondary-button compact-button" href="/api/staff/stock-sheet" download>
            <Download size={16} aria-hidden="true" /> Download the stock sheet
          </a>
          <small className="muted">Every pack with what’s on the shelf now. Open it in Excel or Google Sheets.</small>
        </li>
        <li>
          <span>
            For each pack that changed, fill in <strong>count</strong> (how many are on the shelf now) <em>or</em>{" "}
            <strong>change</strong> (12 to add, -3 to take off). Leave the rest empty.
          </span>
        </li>
        <li className="stock-import-upload">
          <label className="stock-import-file">
            <FileSpreadsheet size={18} aria-hidden="true" />
            <span>{file ? file.name : "Choose the filled-in sheet (.csv)"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (event) => {
                const chosen = event.currentTarget.files?.[0];
                setPlan(null);
                setResult(null);
                setError(undefined);
                if (!chosen) return setFile(null);
                if (chosen.size > 200 * 1024) {
                  setFile(null);
                  return setError("That file is too big. Keep it under 200 KB (about 2,000 rows).");
                }
                setFile({ name: chosen.name, text: await chosen.text() });
              }}
            />
          </label>
          <label className="stock-import-reason">
            Reason <small>Used for rows that don’t give their own, e.g. “Monthly stock count”</small>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </label>
          <button type="button" className="primary-button" onClick={check} disabled={!file || pending} aria-busy={pending && !confirming}>
            {pending && !confirming ? "Checking…" : "Check the sheet"}
          </button>
        </li>
      </ol>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {plan && !plan.problem && !plan.error && (
        <section className="stock-import-plan" aria-label="What the sheet will do">
          <p role="status" className="stock-import-summary">
            <strong>{count("apply")}</strong> change now · <strong>{count("approval")}</strong> wait for an owner ·{" "}
            <strong>{count("error")}</strong> can’t be used · {count("same")} unchanged
          </p>
          {shown.length > 0 && (
            <div className="table-scroll">
              <table className="stock-import-table">
                <caption className="sr-only">Rows of the sheet that change something or can’t be used</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Pack</th>
                    <th scope="col">Now</th>
                    <th scope="col">Change</th>
                    <th scope="col">After</th>
                    <th scope="col">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.line} className={`is-${row.outcome}`}>
                      <td>{row.line}</td>
                      <td>
                        <strong>{row.name ?? row.sku}</strong>
                        <small>
                          {row.sku}
                          {row.label ? ` · ${row.label}` : ""}
                        </small>
                      </td>
                      <td>{row.onHand ?? "–"}</td>
                      <td>{row.delta === undefined ? "–" : row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                      <td>{row.after ?? "–"}</td>
                      <td>
                        {OUTCOME[row.outcome]}
                        {row.message && <small>{row.message}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {usable.length > 0 &&
            (confirming ? (
              <div className="stock-import-confirm" role="group" aria-label="Apply the sheet?">
                <span>
                  Apply {usable.length} {usable.length === 1 ? "change" : "changes"}? Shoppers see the new stock at once; big changes wait
                  for an owner.
                </span>
                <button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={pending}>
                  No, go back
                </button>
                <button type="button" className="primary-button" onClick={apply} disabled={pending} aria-busy={pending}>
                  {pending ? "Applying…" : `Yes, apply ${usable.length}`}
                </button>
              </div>
            ) : (
              <button type="button" className="primary-button" onClick={() => setConfirming(true)}>
                Apply {usable.length} {usable.length === 1 ? "change" : "changes"}
              </button>
            ))}
        </section>
      )}

      {result && (
        <div role="status" className={result.failed.length ? "notice" : "success-message"}>
          <p>
            {result.applied} {result.applied === 1 ? "pack" : "packs"} updated
            {result.waiting > 0 && `, ${result.waiting} sent to an owner for approval`}
            {result.failed.length > 0 && `, ${result.failed.length} not changed`}.
          </p>
          {result.failed.length > 0 && (
            <ul>
              {result.failed.map((row) => (
                <li key={row.line}>
                  Row {row.line} ({row.sku}): {row.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
