import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { objectId } from "@/lib/commerce/service";
import { istDate } from "@/lib/commerce/delivery";
import { User } from "@/lib/db/models";
import { stateOfGstin } from "@/lib/tax/gst";
import { taxProfile } from "@/lib/tax/profile";
import { QuoteRequest, School } from "@/lib/schools/models";
import { draftDiscount } from "@/lib/schools/quotes";
import { quoteDeskAction } from "@/lib/schools/actions";
import { istDatePlus, quoteTotals, startingUnitPrice, supplyType } from "@/lib/schools/quote-math";
import { ownerStatus, quoteDate, quoteMoney } from "@/lib/schools/display";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { RecordHistory } from "@/components/record-history";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { QuoteSheet, type SheetRow } from "@/components/quote-sheet";
import { SendWhenSaved, UnsavedProvider } from "@/components/send-when-saved";
export const metadata = { title: "Quotation desk", robots: { index: false } };

const OPEN = ["requested", "quoted", "changes-requested"];

type Item = {
  variantId: unknown;
  name: string;
  label: string;
  quantity: number;
  schoolPricePaise?: number;
  shopPricePaise: number;
  gstRatePercent?: number;
  hsnCode?: string;
};
type DraftLine = { variantId: unknown; quantity: number; unitPricePaise: number; gstRatePercent: number; hsnCode?: string };
type Version = {
  version: number;
  sentAt: Date;
  validUntil: string;
  totalPaise: number;
  emailed?: { sent?: number; noEmail?: number; failed?: number };
  response?: { kind: string; note?: string; at: Date };
};

/** One school's request on the owner's desk: price it, send it, and follow the school's answer. */
export default async function QuotationDesk({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("settings:write");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const request = await QuoteRequest.findById(id);
  if (!request) notFound();
  const [school, seller, requester] = await Promise.all([
    School.findById(request.schoolId),
    taxProfile(),
    User.findById(request.requestedBy).select("name"),
  ]);
  const supply = supplyType(seller.stateCode, school?.stateCode ?? stateOfGstin(school?.gstin));
  const draft = request.draft?.lines?.length ? request.draft : null;
  const drafted = new Map<string, DraftLine>(
    (draft?.lines ?? []).map((line: DraftLine) => [String(line.variantId), line]),
  );
  const rows: SheetRow[] = (request.items as Item[]).map((item) => {
    const variantId = String(item.variantId);
    const line = drafted.get(variantId);
    const start = startingUnitPrice({
      schoolPricePaise: item.schoolPricePaise,
      shopPricePaise: item.shopPricePaise,
      gstRatePercent: item.gstRatePercent,
    });
    return {
      variantId,
      name: item.name,
      label: item.label,
      asked: item.quantity,
      schoolPricePaise: item.schoolPricePaise ?? undefined,
      shopPricePaise: item.shopPricePaise,
      from: line ? "draft" : start.from,
      // a line saved at 0 was left off the quotation
      quantity: line ? line.quantity : draft ? 0 : item.quantity,
      unitPricePaise: line?.unitPricePaise ?? start.unitPricePaise,
      gstRatePercent: line?.gstRatePercent ?? item.gstRatePercent ?? undefined,
      hsnCode: line?.hsnCode ?? item.hsnCode ?? undefined,
    };
  });
  const open = OPEN.includes(request.status);
  const today = istDate(new Date());
  const versions = [...(request.versions as Version[])].reverse();
  const latestAnswer = (request.versions as Version[]).find((v) => v.version === request.currentVersion)?.response;
  const savedTotals = draft
    ? quoteTotals(
        draft.lines.map((line: DraftLine) => ({
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          gstRatePercent: line.gstRatePercent,
        })),
        draftDiscount(draft),
        supply,
      )
    : null;
  const alreadySent = Boolean(draft && request.currentVersion > 0 && draft.sentAsVersion === request.currentVersion);
  const draftExpired = Boolean(draft && draft.validUntil < today);
  const nextVersion = request.currentVersion + 1;
  const status = ownerStatus(request.status, versions[0]?.validUntil);
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/super-admin/quotations">Quotations</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{request.number}</span>
      </nav>
      <PageHeading
        eyebrow="Owner"
        title={request.number}
        lead={
          <>
            <Link href={`/super-admin/schools/${request.schoolId}`}>{school?.name ?? "School removed"}</Link> · asked by{" "}
            {requester?.name ?? "a representative"} <When at={request.createdAt} />
            {request.neededBy ? ` · needed by ${quoteDate(request.neededBy)}` : ""}
          </>
        }
        aside={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
      />
      {!seller.configured && (
        <p className="notice" role="status">
          Your business and tax details aren’t filled in yet, so the quotation shows a placeholder name and no GSTIN.{" "}
          <Link href="/super-admin#tax">Add them in Store settings</Link>.
        </p>
      )}
      {request.status === "changes-requested" && latestAnswer && (
        <div className="notice quote-changes" role="status">
          <strong>The school asked for changes to version {request.currentVersion}</strong>
          <p>“{latestAnswer.note}”</p>
          <p className="muted">Adjust the sheet, save, and send version {nextVersion}.</p>
        </div>
      )}
      {request.status === "accepted" && (
        <p className="success-message" role="status">
          The school accepted version {request.currentVersion}. Arrange delivery and billing with them; nothing here becomes an
          order on its own.
        </p>
      )}
      {request.status === "closed" && (
        <p className="notice" role="status">
          Closed{request.closedReason ? `: ${request.closedReason}` : "."}
        </p>
      )}
      {request.note && (
        <section className="panel" aria-labelledby="school-note">
          <h2 id="school-note">The school’s note</h2>
          <p className="quote-request-note">“{request.note}”</p>
        </section>
      )}

      {open && (
        <UnsavedProvider>
          <section className="panel" aria-labelledby="sheet-heading">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Version {nextVersion}</span>
                <h2 id="sheet-heading">Pricing sheet</h2>
              </div>
            </div>
            <p className="muted">
              Rates are before GST. Set a quantity to 0 to leave an item off. Each line starts at the school price, or the shop
              price with GST taken out.
            </p>
            <QuoteSheet
              requestId={id}
              rows={rows}
              discountType={(draft?.discountType as "none" | "percent" | "amount") ?? "none"}
              discountValue={Number(draft?.discountValue ?? 0)}
              validUntil={draft?.validUntil && draft.validUntil >= today ? draft.validUntil : istDatePlus(15)}
              minDate={today}
              maxDate={istDatePlus(365)}
              note={draft?.note}
              supply={supply}
            />
          </section>
          <section className="panel quote-send" aria-labelledby="send-heading">
            <h2 id="send-heading">Send to the school</h2>
            {!draft ? (
              <p className="muted">Save the sheet first. Sending uses the saved draft.</p>
            ) : alreadySent ? (
              <p className="muted">
                This draft went out as version {request.currentVersion}. Change something and save to send version {nextVersion}.
              </p>
            ) : draftExpired ? (
              <p className="notice">The saved valid-until date has passed. Choose a new date, save, then send.</p>
            ) : (
              <p className="muted">
                Version {nextVersion}: {draft.lines.length} {draft.lines.length === 1 ? "item" : "items"},{" "}
                <strong>{quoteMoney(savedTotals!.totalPaise)}</strong> with GST, valid until {quoteDate(draft.validUntil)}. Every
                representative gets a notification, and an email if they have one.
              </p>
            )}
            <SendWhenSaved
              action={quoteDeskAction}
              submit="Send quotation"
              waiting="Save the sheet first: sending uses what is saved."
              disabled={!draft || alreadySent || draftExpired}
              confirmMessage={
                savedTotals && draft
                  ? `Version ${nextVersion} for ${quoteMoney(savedTotals.totalPaise)} with GST, valid until ${quoteDate(draft.validUntil)}, goes to ${school?.name ?? "the school"}. A sent version can’t be changed; you can send a newer one.`
                  : undefined
              }
            >
              <input type="hidden" name="operation" value="send" />
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="stamp" value={draft ? new Date(draft.updatedAt).toISOString() : ""} />
            </SendWhenSaved>
          </section>
        </UnsavedProvider>
      )}

      <section className="panel" aria-labelledby="versions-heading">
        <h2 id="versions-heading">Sent versions</h2>
        <DataTable
          bare
          caption="Quotation versions sent to the school"
          rows={versions}
          rowKey={(v) => String(v.version)}
          columns={[
            {
              header: "Version",
              cell: (v) => (
                <Link href={`/school/quotations/${id}?v=${v.version}`}>
                  <strong>Version {v.version}</strong>
                </Link>
              ),
            },
            { header: "Sent", cell: (v) => <When at={v.sentAt} /> },
            { header: "Total with GST", numeric: true, cell: (v) => quoteMoney(v.totalPaise) },
            { header: "Valid until", cell: (v) => quoteDate(v.validUntil) },
            {
              header: "Reached",
              cell: (v) =>
                v.emailed
                  ? [
                      `${v.emailed.sent ?? 0} emailed`,
                      v.emailed.noEmail ? `${v.emailed.noEmail} no email` : null,
                      v.emailed.failed ? `${v.emailed.failed} failed` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Notified in the app",
            },
            {
              header: "School’s answer",
              cell: (v) =>
                v.response ? (
                  <span>
                    <StatusPill tone={v.response.kind === "accepted" ? "ok" : "warn"}>
                      {v.response.kind === "accepted" ? "Accepted" : "Changes asked"}
                    </StatusPill>
                    {v.response.note ? <small> “{v.response.note}”</small> : null}
                  </span>
                ) : (
                  "No answer yet"
                ),
            },
          ]}
          empty={<p className="muted">Nothing sent yet.</p>}
        />
      </section>

      {open && (
        <section className="panel" aria-labelledby="close-heading">
          <h2 id="close-heading">Close this request</h2>
          <p className="muted">If you won’t quote it, or the school no longer needs it. The school is told why.</p>
          <ActionForm
            action={quoteDeskAction}
            submit="Close request"
            buttonClassName="secondary-button"
            confirmMessage="The school can’t accept or ask for changes after this. To quote again they send a new request."
          >
            <input type="hidden" name="operation" value="close" />
            <input type="hidden" name="requestId" value={id} />
            <label>
              Reason for the school
              <input name="reason" required minLength={5} maxLength={300} placeholder="e.g. These items aren’t available this term" />
            </label>
          </ActionForm>
        </section>
      )}
      <RecordHistory target={id} title="History of this request" />
    </section>
  );
}
