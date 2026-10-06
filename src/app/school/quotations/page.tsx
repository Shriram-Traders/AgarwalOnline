import Link from "next/link";
import { FileText } from "lucide-react";
import { requireSchoolPage } from "@/lib/schools/access";
import { QuoteRequest } from "@/lib/schools/models";
import { quoteMoney, repStatus } from "@/lib/schools/display";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
export const metadata = { title: "School quotations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Every quotation request the school has sent, newest first; only this school's. */
export default async function SchoolQuotations({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { school } = await requireSchoolPage(s, "/school/quotations");
  const requests = await QuoteRequest.find({ schoolId: school.id })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("number status items createdAt currentVersion versions.version versions.totalPaise versions.validUntil neededBy");
  const latest = (request: { currentVersion: number; versions: { version: number; totalPaise: number; validUntil: string }[] }) =>
    request.versions.find((v) => v.version === request.currentVersion);
  return (
    <section className="page-container school-area">
      <PageHeading
        eyebrow={school.name}
        title="Quotations"
        lead="What your school has asked for, and the store’s quotations back. Open one to accept it or ask for changes."
      />
      <p className="results-line" role="status">
        <span>
          <strong>{requests.length}</strong> {requests.length === 1 ? "request" : "requests"}
        </span>
      </p>
      <DataTable
        caption="Your school's quotation requests"
        rows={requests}
        rowKey={(request) => String(request._id)}
        columns={[
          {
            header: "Quotation",
            cell: (request) => (
              <span className="product-cell">
                <span>
                  <Link href={`/school/quotations/${request._id}`}>
                    <strong>{request.number}</strong>
                  </Link>
                  <small>
                    {request.items.length} {request.items.length === 1 ? "item" : "items"}
                    {request.currentVersion > 1 ? ` · version ${request.currentVersion}` : ""}
                  </small>
                </span>
              </span>
            ),
          },
          { header: "Asked", cell: (request) => <When at={request.createdAt} /> },
          {
            header: "Status",
            cell: (request) => {
              const status = repStatus(request.status, latest(request)?.validUntil);
              return <StatusPill tone={status.tone}>{status.label}</StatusPill>;
            },
          },
          {
            header: "Total with GST",
            numeric: true,
            cell: (request) => {
              const version = latest(request);
              return version ? quoteMoney(version.totalPaise) : "Not priced yet";
            },
          },
        ]}
        empty={
          <EmptyState
            icon={FileText}
            title="No quotations yet"
            body="Fill the basket from the school catalogue, then check out with “Create quotation”. It shows here with the store’s reply."
            action={
              <Link href="/school/catalog" className="primary-button">
                Browse school items
              </Link>
            }
          />
        }
      />
    </section>
  );
}
