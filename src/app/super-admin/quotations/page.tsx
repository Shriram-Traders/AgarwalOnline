import Link from "next/link";
import { FileText } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { objectId } from "@/lib/commerce/service";
import { QuoteRequest, School } from "@/lib/schools/models";
import { ownerStatus, quoteMoney } from "@/lib/schools/display";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
export const metadata = { title: "Quotations", robots: { index: false } };

const VIEWS: Record<string, { label: string; statuses: string[] }> = {
  "needs-you": { label: "Needs you", statuses: ["requested", "changes-requested"] },
  waiting: { label: "Sent, waiting for the school", statuses: ["quoted"] },
  accepted: { label: "Accepted", statuses: ["accepted"] },
  closed: { label: "Closed", statuses: ["closed"] },
  all: { label: "All", statuses: [] },
};

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; school?: string }>;
}) {
  await requirePage("settings:write");
  const params = await searchParams;
  const view = VIEWS[params.status ?? ""] ? params.status! : "needs-you";
  const schoolId = objectId.safeParse(params.school).success ? params.school : undefined;
  const q = params.q?.trim().slice(0, 60);
  const schools = await School.find({}).select("name").sort({ name: 1 }).limit(500);
  const pattern = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const matchingSchools = pattern ? schools.filter((school) => pattern.test(school.name)).map((school) => school._id) : [];
  const filter: Record<string, unknown> = {
    ...(VIEWS[view].statuses.length ? { status: { $in: VIEWS[view].statuses } } : {}),
    ...(schoolId ? { schoolId } : {}),
    ...(pattern ? { $or: [{ number: pattern }, { schoolId: { $in: matchingSchools } }] } : {}),
  };
  const [requests, waiting] = await Promise.all([
    QuoteRequest.find(filter)
      .sort({ updatedAt: -1 })
      .limit(300)
      .select("number schoolId status items createdAt updatedAt neededBy currentVersion versions.version versions.totalPaise versions.validUntil"),
    QuoteRequest.countDocuments({ status: { $in: VIEWS["needs-you"].statuses } }),
  ]);
  const nameOf = (id: unknown) => schools.find((school) => String(school._id) === String(id))?.name ?? "School removed";
  const latest = (request: { currentVersion: number; versions: { version: number; totalPaise: number; validUntil: string }[] }) =>
    request.versions.find((v) => v.version === request.currentVersion);
  const filtered = Boolean(q || schoolId || (params.status && params.status !== "needs-you"));
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Quotations"
        lead="Schools’ quotation requests. Price them line by line, then send; the school accepts or asks for changes."
        aside={
          <Link href="/super-admin/schools" className="secondary-button">
            Schools
          </Link>
        }
      />
      <FilterBar label="Filter quotations" submitLabel="Show quotations" clearHref={filtered ? "/super-admin/quotations" : undefined}>
        <label>
          Search <small>number or school</small>
          <input name="q" defaultValue={q} maxLength={60} />
        </label>
        <label>
          Show
          <select name="status" defaultValue={view}>
            {Object.entries(VIEWS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
                {key === "needs-you" && waiting ? ` (${waiting})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          School
          <select name="school" defaultValue={schoolId ?? ""}>
            <option value="">All schools</option>
            {schools.map((school) => (
              <option key={String(school._id)} value={String(school._id)}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{requests.length}</strong> {requests.length === 1 ? "quotation request" : "quotation requests"} ·{" "}
          {VIEWS[view].label.toLowerCase()}
        </span>
      </p>
      <DataTable
        caption="Quotation requests from schools"
        rows={requests}
        rowKey={(request) => String(request._id)}
        columns={[
          {
            header: "Quotation",
            cell: (request) => (
              <span className="product-cell">
                <span>
                  <Link href={`/super-admin/quotations/${request._id}`}>
                    <strong>{request.number}</strong>
                  </Link>
                  <small>
                    {request.items.length} {request.items.length === 1 ? "item" : "items"}
                    {request.neededBy ? ` · needed by ${request.neededBy}` : ""}
                  </small>
                </span>
              </span>
            ),
          },
          {
            header: "School",
            cell: (request) => <Link href={`/super-admin/schools/${request.schoolId}`}>{nameOf(request.schoolId)}</Link>,
          },
          { header: "Asked", cell: (request) => <When at={request.createdAt} /> },
          {
            header: "Status",
            cell: (request) => {
              const status = ownerStatus(request.status, latest(request)?.validUntil);
              return <StatusPill tone={status.tone}>{status.label}</StatusPill>;
            },
          },
          {
            header: "Latest total",
            numeric: true,
            cell: (request) => {
              const version = latest(request);
              return version ? `${quoteMoney(version.totalPaise)} (v${version.version})` : "Not priced yet";
            },
          },
        ]}
        empty={
          <EmptyState
            icon={FileText}
            title={view === "needs-you" && !q && !schoolId ? "Nothing waiting for you" : "No quotation matches"}
            body={
              view === "needs-you" && !q && !schoolId
                ? "New requests from schools, and changes they ask for, show here."
                : "Try another search, or show all quotations."
            }
            heading="h3"
            action={
              <Link href="/super-admin/quotations?status=all" className="secondary-button">
                Show all quotations
              </Link>
            }
          />
        }
      />
    </section>
  );
}
