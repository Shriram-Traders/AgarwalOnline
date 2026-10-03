import Link from "next/link";
import { Plus, School as SchoolIcon } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { School, SchoolAccessRequest, SchoolMember, QuoteRequest } from "@/lib/schools/models";
import { schoolAdminAction } from "@/lib/schools/actions";
import { schoolStateLabel } from "@/lib/schools/members";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { SchoolFields } from "@/components/school-fields";
export const metadata = { title: "Schools", robots: { index: false } };

const countBy = (rows: { _id: unknown; count: number }[]) =>
  new Map(rows.map((row) => [String(row._id), row.count]));

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; status?: string }>;
}) {
  await requirePage("settings:write");
  const params = await searchParams;
  const [schools, members, requests, quotes] = await Promise.all([
    School.find({}).sort({ name: 1 }).limit(500),
    SchoolMember.aggregate([{ $group: { _id: "$schoolId", count: { $sum: 1 } } }]),
    SchoolAccessRequest.aggregate([{ $match: { state: "pending" } }, { $group: { _id: "$schoolId", count: { $sum: 1 } } }]),
    QuoteRequest.aggregate([
      { $match: { status: { $in: ["requested", "changes-requested"] } } },
      { $group: { _id: "$schoolId", count: { $sum: 1 } } },
    ]),
  ]);
  const memberCount = countBy(members);
  const requestCount = countBy(requests);
  const quoteCount = countBy(quotes);
  const waitingRequests = requests.reduce((n, row) => n + row.count, 0);
  const waitingQuotes = quotes.reduce((n, row) => n + row.count, 0);
  const q = params.q?.trim().toLowerCase();
  const shown = schools.filter(
    (school) =>
      (!q || [school.name, school.phone ?? "", school.gstin ?? "", school.contactName ?? ""].some((text) => text.toLowerCase().includes(q))) &&
      (params.status !== "active" || school.active !== false) &&
      (params.status !== "paused" || school.active === false),
  );
  const filtered = Boolean(q || params.status);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Schools"
        lead="Schools that buy in bulk. Their representatives ask for quotations; you price and send them."
        aside={
          <Link href="/super-admin/schools?edit=new#school" className="primary-button">
            <Plus size={18} aria-hidden="true" /> Add a school
          </Link>
        }
      />
      {(waitingRequests > 0 || waitingQuotes > 0) && (
        <p className="notice school-waiting" role="status">
          Waiting for you:{" "}
          {waitingRequests > 0 && (
            <>
              <strong>{waitingRequests}</strong> access {waitingRequests === 1 ? "request" : "requests"} (open a school to
              decide)
            </>
          )}
          {waitingRequests > 0 && waitingQuotes > 0 && " · "}
          {waitingQuotes > 0 && (
            <Link href="/super-admin/quotations">
              <strong>{waitingQuotes}</strong> quotation {waitingQuotes === 1 ? "request" : "requests"} to price
            </Link>
          )}
        </p>
      )}
      {params.edit === "new" && (
        <div className="panel adjust-panel" id="school">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">New school</span>
              <h2>Add a school</h2>
            </div>
            <Link href="/super-admin/schools" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={schoolAdminAction} submit="Add school">
            <input type="hidden" name="operation" value="create" />
            <SchoolFields />
          </ActionForm>
        </div>
      )}
      <FilterBar label="Filter schools" submitLabel="Show schools" clearHref={filtered ? "/super-admin/schools" : undefined}>
        <label>
          Search <small>name, phone or GSTIN</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">All schools</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{shown.length}</strong> of {schools.length} {schools.length === 1 ? "school" : "schools"}
        </span>
      </p>
      <DataTable
        caption="Schools with their representatives, access requests and open quotations"
        rows={shown}
        rowKey={(school) => String(school._id)}
        columns={[
          {
            header: "School",
            cell: (school) => (
              <span className="product-cell">
                <span>
                  <Link href={`/super-admin/schools/${school._id}`}>
                    <strong>{school.name}</strong>
                  </Link>
                  <small>
                    {[schoolStateLabel(school.stateCode), school.gstin ? `GSTIN ${school.gstin}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No state or GSTIN yet"}
                  </small>
                </span>
              </span>
            ),
          },
          { header: "Representatives", numeric: true, cell: (school) => memberCount.get(String(school._id)) ?? 0 },
          {
            header: "Access requests",
            numeric: true,
            cell: (school) => {
              const count = requestCount.get(String(school._id)) ?? 0;
              return count ? (
                <Link href={`/super-admin/schools/${school._id}#requests`}>
                  <StatusPill tone="warn">{count} waiting</StatusPill>
                </Link>
              ) : (
                "None"
              );
            },
          },
          {
            header: "Quotations to price",
            numeric: true,
            cell: (school) => {
              const count = quoteCount.get(String(school._id)) ?? 0;
              return count ? <Link href={`/super-admin/quotations?school=${school._id}`}>{count}</Link> : "None";
            },
          },
          {
            header: "Status",
            cell: (school) =>
              school.active === false ? <StatusPill tone="neutral">Paused</StatusPill> : <StatusPill tone="ok">Active</StatusPill>,
          },
        ]}
        empty={
          <EmptyState
            icon={SchoolIcon}
            title={filtered ? "No school matches" : "No schools yet"}
            body={
              filtered
                ? "Check the spelling, or clear the filters."
                : "Add a school, then add its representatives or share its join link."
            }
            heading="h3"
            action={
              filtered ? undefined : (
                <Link href="/super-admin/schools?edit=new#school" className="primary-button">
                  Add a school
                </Link>
              )
            }
          />
        }
      />
    </section>
  );
}
