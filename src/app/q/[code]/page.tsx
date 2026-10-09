import Link from "next/link";
import { notFound } from "next/navigation";
import { Hourglass } from "lucide-react";
import { School } from "@/lib/schools/models";
import { quotationByShareToken } from "@/lib/schools/quotes";
import { isExpired } from "@/lib/schools/quote-math";
import { quoteDate, quoteMoney, repStatus } from "@/lib/schools/display";
import { PageHeading } from "@/components/page-heading";
import { PrintButton } from "@/components/print-button";
import { QuotationDocument, type QuotationVersion } from "@/components/quotation-document";
import { StatusPill } from "@/components/status-pill";
export const metadata = { title: "Quotation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A quotation's view-only link, for whoever the school or the store hands it to: the latest sent
 * version to read and print, signed in or not. Accepting or asking for changes stays with the
 * school's representatives, signed in; the school's notes and the store's draft never show here.
 */
export default async function SharedQuotation({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const request = await quotationByShareToken(code);
  if (!request) notFound();
  const school = await School.findById(request.schoolId).select("name");
  const sent = request.versions.find((v: { version: number }) => v.version === request.currentVersion) as
    | { toObject: () => QuotationVersion }
    | undefined;
  const latest = sent?.toObject();
  const schoolName = latest?.buyer?.name ?? school?.name ?? "the school";
  const status = repStatus(request.status, latest?.validUntil);
  const expired = request.status === "quoted" && latest ? isExpired(latest.validUntil) : false;
  return (
    <section className="page-container quotation-page shared-quotation">
      <PageHeading
        eyebrow={`Quotation for ${schoolName}`}
        title={request.number}
        lead={
          latest
            ? `Version ${latest.version} · ${quoteMoney(latest.totalPaise)} with GST · valid until ${quoteDate(latest.validUntil)}`
            : "Agarwal General Stores, Nagothane"
        }
        aside={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
      />
      {request.status === "closed" && (
        <p className="notice" role="status">
          The store closed this quotation request.
        </p>
      )}
      {request.status === "accepted" && latest && (
        <p className="success-message" role="status">
          {schoolName} accepted version {latest.version}.
        </p>
      )}
      {request.status === "changes-requested" && (
        <p className="notice" role="status">
          The school asked for changes. A revised quotation will appear here once the store sends it.
        </p>
      )}
      {expired && latest && (
        <p className="notice" role="status">
          This quotation expired on {quoteDate(latest.validUntil)}. The school can ask the store for a fresh one.
        </p>
      )}

      {latest ? (
        <>
          <div className="quotation-actions">
            <PrintButton />
          </div>
          <QuotationDocument number={request.number} quote={latest} />
        </>
      ) : (
        request.status !== "closed" && (
          <p className="notice school-waiting" role="status">
            <Hourglass size={18} aria-hidden="true" /> The store hasn’t priced this yet. The quotation shows here once it’s
            sent.
          </p>
        )
      )}

      <section className="panel shared-quotation-answer" aria-labelledby="answer-heading">
        <div>
          <h2 id="answer-heading">Accepting or asking for changes</h2>
          <p className="muted">
            Anyone with this link can see and print the quotation. Only {schoolName}’s representatives can accept it or ask
            for changes, after signing in.
          </p>
        </div>
        <Link className="secondary-button" href={`/school/quotations/${request._id}`}>
          I represent the school
        </Link>
      </section>
    </section>
  );
}
