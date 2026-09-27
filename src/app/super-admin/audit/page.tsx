import { staffRoleOf, type Role } from "@/lib/auth/permissions";
import Link from "next/link";
import mongoose from "mongoose";
import { ScrollText } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { AuditLog, User } from "@/lib/db/models";
import { AUDIT_GROUPS, auditLabel, type AuditGroup } from "@/lib/audit-labels";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { When } from "@/components/when";
export const metadata = { title: "Audit trail", robots: { index: false } };

const ROLE_NAMES: Record<string, string> = {
  "super-admin": "Owner",
  admin: "Admin",
  delivery: "Delivery partner",
  customer: "Customer",
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /password|secret|token|code|signature/i.test(key) ? "[redacted]" : redact(entry),
    ]),
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage("audit:read");
  const params = await searchParams;
  const group = (params.type && params.type in AUDIT_GROUPS ? params.type : null) as AuditGroup | null;
  const query: Record<string, unknown> = {};
  if (params.actor && mongoose.isValidObjectId(params.actor)) query.actorId = params.actor;
  if (group)
    query.action = {
      $regex: `^(${AUDIT_GROUPS[group].prefixes.map(escapeRegex).join("|")})`,
    };
  if (params.q) {
    const text = params.q.trim().slice(0, 80);
    const term = new RegExp(escapeRegex(text), "i");
    // people search in words ("stock"), the log stores codes ("inventory.adjust")
    const codes = (await AuditLog.distinct("action")).filter((code: string) => term.test(auditLabel(code)));
    query.$or = [{ action: term }, { target: term }, { action: { $in: codes } }];
  }
  const from = params.from ? new Date(`${params.from}T00:00:00+05:30`) : null;
  const to = params.to ? new Date(`${params.to}T23:59:59.999+05:30`) : null;
  const validFrom = from && !Number.isNaN(from.getTime()) ? from : null;
  const validTo = to && !Number.isNaN(to.getTime()) ? to : null;
  if (validFrom || validTo)
    query.at = { ...(validFrom ? { $gte: validFrom } : {}), ...(validTo ? { $lte: validTo } : {}) };
  const [events, actors, total] = await Promise.all([
    AuditLog.find(query).sort({ at: -1 }).limit(200).populate("actorId", "name email roles"),
    User.find({ roles: { $in: ["delivery", "admin", "super-admin"] } })
      .sort({ name: 1 })
      .select("name roles"),
    AuditLog.countDocuments(query),
  ]);
  const filtered = Boolean(group || params.q || params.actor || validFrom || validTo);
  const keep = (extra: Record<string, string>) =>
    `/super-admin/audit?${new URLSearchParams(
      Object.fromEntries(
        Object.entries({ q: params.q, actor: params.actor, from: params.from, to: params.to, ...extra }).filter(
          ([, value]) => Boolean(value),
        ),
      ) as Record<string, string>,
    )}`;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Audit trail"
        lead="Every sensitive action, who took it and when. Entries cannot be edited or deleted."
        aside={<span className="live-chip">{total} {total === 1 ? "entry" : "entries"}</span>}
      />
      <nav className="catalog-chips" aria-label="Show a kind of activity">
        <Link href={keep({})} aria-current={!group ? "page" : undefined}>
          Everything
        </Link>
        {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((key) => (
          <Link key={key} href={keep({ type: key })} aria-current={group === key ? "page" : undefined}>
            {AUDIT_GROUPS[key].label}
          </Link>
        ))}
      </nav>
      <FilterBar label="Filter the audit trail" submitLabel="Filter" clearHref="/super-admin/audit">
        {group && <input type="hidden" name="type" value={group} />}
        <label>
          Search <small>an action in words, or an order or record id</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Team member
          <select name="actor" defaultValue={params.actor ?? ""}>
            <option value="">Everyone</option>
            {actors.map((actor) => (
              <option key={String(actor._id)} value={String(actor._id)}>
                {actor.name} · {ROLE_NAMES[staffRoleOf(actor.roles as Role[]) ?? "customer"]}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input name="from" type="date" defaultValue={params.from} />
        </label>
        <label>
          To
          <input name="to" type="date" defaultValue={params.to} />
        </label>
      </FilterBar>
      <DataTable
        caption="Audit entries, newest first: when, who, what happened and to which record"
        rows={events}
        rowKey={(event) => String(event._id)}
        columns={[
          { header: "When", cell: (event) => <When at={event.at} /> },
          {
            header: "Who",
            cell: (event) => {
              const actor = event.actorId as unknown as { name?: string; roles?: string[] } | null;
              return (
                <span className="audit-who">
                  <strong>{actor?.name ?? "System"}</strong>
                  {actor?.roles && <small>{ROLE_NAMES[staffRoleOf(actor.roles as Role[]) ?? "customer"]}</small>}
                </span>
              );
            },
          },
          {
            header: "What happened",
            cell: (event) => (
              <span className="audit-what">
                <strong>{auditLabel(event.action)}</strong>
                <code>{event.action}</code>
              </span>
            ),
          },
          { header: "Record", cell: (event) => (event.target ? <code>{event.target}</code> : "—") },
          {
            header: "Details",
            cell: (event) =>
              event.details ? (
                <details className="audit-details">
                  <summary>Show</summary>
                  <pre>{JSON.stringify(redact(event.details), null, 2)}</pre>
                </details>
              ) : (
                "—"
              ),
          },
        ]}
        empty={
          <EmptyState
            icon={ScrollText}
            title={filtered ? "Nothing matches these filters" : "No activity yet"}
            body={
              filtered
                ? "Try a different kind of activity, person or date range."
                : "Sign-ins, stock changes, refunds and staff changes appear here as they happen."
            }
            heading="h3"
          />
        }
      />
      {total > events.length && <p className="muted">Showing the newest {events.length} of {total} entries.</p>}
    </section>
  );
}
