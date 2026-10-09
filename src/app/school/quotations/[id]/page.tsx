import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Hourglass } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { istDate } from "@/lib/commerce/delivery";
import { User } from "@/lib/db/models";
import { getEnv } from "@/lib/env";
import { requireSchoolPage } from "@/lib/schools/access";
import { quotationShareHref } from "@/lib/schools/links";
import { quotationForViewer, quoteShareToken } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { isExpired } from "@/lib/schools/quote-math";
import { expectedPrice, quoteDate, quoteMoney, repStatus } from "@/lib/schools/display";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PolicyNotice } from "@/components/policy-notice";
import { PrintButton } from "@/components/print-button";
import { QuotationDocument, type QuotationVersion } from "@/components/quotation-document";
import { ShareLink } from "@/components/share-link";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
export const metadata = { title: "Quotation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Item = { name: string; label: string; quantity: number; schoolPricePaise?: number; gstRatePercent?: number };

/** A school's quotation: what it asked for, the store's quotation, and its answer. */
export default async function SchoolQuotation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; sent?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?then=${encodeURIComponent("/school/quotations")}`);
  const found = await quotationForViewer(user, id);
  if (!found) notFound();
  const { request } = found;
  // the owner may look too, but the school area itself is only for its representatives
  const area = found.as === "rep" ? await requireSchoolPage(String(request.schoolId), `/school/quotations/${id}`) : null;
  const versions: QuotationVersion[] = request.versions.map((v: { toObject: () => QuotationVersion }) => v.toObject());
  const currentVersion = versions.find((v) => v.version === request.currentVersion);
  const wanted = Number(query.v);
  const shown = versions.find((v) => v.version === wanted) ?? currentVersion;
  const status = repStatus(request.status, currentVersion?.validUntil);
  const canAnswer =
    found.as === "rep" && request.status === "quoted" && shown && shown.version === request.currentVersion;
  const expired = currentVersion ? isExpired(currentVersion.validUntil) : false;
  const answer = (request.versions.find((v: { version: number }) => v.version === shown?.version) as
    | { response?: { kind: string; note?: string; by: unknown; at: Date } }
    | undefined)?.response;
  const answeredBy = answer ? await User.findById(answer.by).select("name") : null;
  const back = area ? "/school/quotations" : `/super-admin/quotations/${id}`;
  // the view-only link only has something to show once a version is sent
  const shareUrl = currentVersion
    ? `${getEnv().APP_ORIGIN}${quotationShareHref(await quoteShareToken(request))}`
    : null;
  return (
    <section className="page-container school-area quotation-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href={back}>{area ? "Quotations" : "Quotation desk"}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{request.number}</span>
      </nav>
      <PageHeading
        title={request.number}
        lead={`Asked ${quoteDate(istDate(request.createdAt))} · ${request.items.length} ${
          request.items.length === 1 ? "item" : "items"
        }${request.neededBy ? ` · needed by ${quoteDate(request.neededBy)}` : ""}`}
        aside={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
      />
      {query.sent && request.status === "requested" && (
        <p className="success-message" role="status">
          Sent to the store as {request.number}. You’ll get a notification when the quotation is ready.
        </p>
      )}
      {request.status === "closed" && (
        <p className="notice" role="status">
          The store closed this request{request.closedReason ? `: ${request.closedReason}` : "."}
        </p>
      )}
      {request.status === "accepted" && currentVersion && (
        <p className="success-message" role="status">
          Your school accepted version {currentVersion.version} ({quoteMoney(currentVersion.totalPaise)} with GST). The store
          will be in touch about delivery and billing.
        </p>
      )}
      {request.status === "changes-requested" && (
        <p className="notice" role="status">
          You asked for changes. The store will send a revised quotation.
        </p>
      )}

      {shown ? (
        <>
          {versions.length > 1 && (
            <nav className="catalog-chips quote-versions" aria-label="Quotation versions">
              {versions.map((v) => (
                <Link
                  key={v.version}
                  href={`?v=${v.version}`}
                  aria-current={v.version === shown.version ? "page" : undefined}
                >
                  Version {v.version}
                  {v.version === request.currentVersion ? " (latest)" : ""}
                </Link>
              ))}
            </nav>
          )}
          {shown.version !== request.currentVersion && (
            <p className="notice" role="status">
              This is an older version. The latest is version {request.currentVersion}.
            </p>
          )}
          <div className="quotation-actions">
            <PrintButton />
          </div>
          <QuotationDocument number={request.number} quote={shown} />
          {answer && (
            <p className={answer.kind === "accepted" ? "success-message" : "notice"} role="status">
              {answer.kind === "accepted" ? "Accepted" : "Changes asked"} by {answeredBy?.name ?? "your school"},{" "}
              <When at={answer.at} />
              {answer.note ? `: “${answer.note}”` : "."}
            </p>
          )}
          {canAnswer && (
            <section className="panel quote-answer" aria-labelledby="answer-heading">
              <h2 id="answer-heading">Your answer</h2>
              {expired ? (
                <p className="notice">This quotation expired on {quoteDate(shown.validUntil)}. Ask for changes to get a fresh one.</p>
              ) : (
                <p className="muted">
                  Accepting tells the store to go ahead at these prices. Nothing is charged here; the store arranges delivery and
                  billing with you.
                </p>
              )}
              <div className="answer-forms">
                {!expired && (
                  <ActionForm
                    action={schoolRepAction}
                    submit="Accept quotation"
                    className="form-stack"
                    confirmMessage={`Your school accepts version ${shown.version} for ${quoteMoney(shown.totalPaise)} with GST. The store is told straight away.`}
                  >
                    <input type="hidden" name="intent" value="accept" />
                    <input type="hidden" name="requestId" value={id} />
                    <input type="hidden" name="version" value={shown.version} />
                    <PolicyNotice kind="school-accept" />
                  </ActionForm>
                )}
                <ActionForm
                  action={schoolRepAction}
                  submit="Ask for changes"
                  className="form-stack"
                  buttonClassName="secondary-button"
                >
                  <input type="hidden" name="intent" value="changes" />
                  <input type="hidden" name="requestId" value={id} />
                  <input type="hidden" name="version" value={shown.version} />
                  <label>
                    What should change?
                    <textarea
                      name="note"
                      required
                      minLength={5}
                      maxLength={1000}
                      rows={3}
                      placeholder="e.g. Can you do 5% less on notebooks if we take 1,000?"
                    />
                  </label>
                </ActionForm>
              </div>
            </section>
          )}
        </>
      ) : (
        request.status !== "closed" && (
          <p className="notice school-waiting" role="status">
            <Hourglass size={18} aria-hidden="true" /> The store is preparing your quotation.
          </p>
        )
      )}

      {shareUrl && (
        <section className="panel quote-share" aria-labelledby="share-heading">
          <h2 id="share-heading">Share this quotation</h2>
          <p className="muted">
            Send it to your principal or accounts office. They can see and print the latest version without signing in, but
            only your school’s representatives can accept it or ask for changes.
          </p>
          <ShareLink
            label="View-only link"
            url={shareUrl}
            hint="If the link reaches the wrong person, ask the store for a new one; the old one then stops working."
            title={`Quotation ${request.number} from Agarwal General Stores`}
            copy="Copy link"
            copied="Copied"
          />
        </section>
      )}

      <section className="panel" aria-labelledby="asked-heading">
        <h2 id="asked-heading">What your school asked for</h2>
        {request.note && <p className="quote-request-note">“{request.note}”</p>}
        <DataTable
          bare
          caption="Items in this request"
          rows={request.items as Item[]}
          rowKey={(item) => `${item.name}-${item.label}`}
          columns={[
            {
              header: "Item",
              cell: (item) => (
                <span className="product-cell">
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.label}</small>
                  </span>
                </span>
              ),
            },
            { header: "Quantity", numeric: true, cell: (item) => item.quantity.toLocaleString("en-IN") },
            {
              header: "Expected when asked",
              cell: (item) => expectedPrice(item.schoolPricePaise ?? undefined, item.gstRatePercent ?? undefined, quoteMoney),
            },
          ]}
        />
      </section>
    </section>
  );
}
