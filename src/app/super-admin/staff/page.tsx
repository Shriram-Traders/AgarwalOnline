import Link from "next/link";
import mongoose from "mongoose";
import { UsersRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PasswordInput } from "@/components/password-input";
import { RecordHistory } from "@/components/record-history";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import {
  grants,
  staffRoleOf,
  staffRoles,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { User } from "@/lib/db/models";
import { staffAction } from "@/lib/staff/actions";
export const metadata = { title: "Staff & roles", robots: { index: false } };

const labels: Record<string, string> = {
  delivery: "Delivery partner",
  admin: "Admin",
  "super-admin": "Owner",
};
const SUMMARY: Record<string, string> = {
  delivery:
    "Delivers the orders assigned to them and records the cash they collect.",
  admin:
    "Runs the day: orders, packing, delivery, catalog, stock, customers and support.",
  "super-admin":
    "Everything an admin does, plus settings, staff, approvals, offers, refunds and the audit trail.",
};
/** What each permission lets a person do, in the words the owner would use. */
const CAN: Partial<Record<Permission, string>> = {
  "delivery:assigned": "See and complete their assigned deliveries",
  "cod:collect": "Record cash collected at the door",
  "order:manage": "Confirm, pack and complete orders",
  "packing:write": "Fill in packing checklists",
  "delivery:assign": "Assign delivery partners",
  "cod:reconcile": "Reconcile cash handovers",
  "catalog:write": "Edit products and aisles",
  "inventory:adjust": "Adjust stock",
  "approval:request": "Ask for price and stock changes",
  "chat:support": "Answer support chats",
  "complaint:manage": "Handle complaints and returns",
  "review:moderate": "Moderate reviews",
  "analytics:read": "See analytics",
  "approval:review": "Approve or reject changes",
  "settings:write": "Change store settings",
  "staff:manage": "Add staff and change roles",
  "promotion:write": "Create and pause offers",
  "refund:write": "Issue refunds",
  "audit:read": "Read the audit trail",
};

export default async function StaffManagement({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; find?: string; added?: string }>;
}) {
  const actor = await requirePage("staff:manage");
  const { edit, find, added } = await searchParams;
  const term = find?.trim().slice(0, 60);
  const pattern = term
    ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;
  const [staff, candidates] = await Promise.all([
    User.find({ roles: { $in: staffRoles } })
      .sort({ active: -1, name: 1 })
      .select("name phone email roles active createdAt"),
    // people who already have an account and no staff role yet; newest first until you search
    User.find({
      roles: { $nin: staffRoles },
      active: true,
      ...(pattern
        ? { $or: [{ name: pattern }, { phone: pattern }, { email: pattern }] }
        : {}),
    })
      .sort({ createdAt: -1 })
      .limit(pattern ? 25 : 8)
      .select("name phone email createdAt"),
  ]);
  const editing =
    edit && mongoose.isValidObjectId(edit)
      ? staff.find((member) => String(member._id) === edit)
      : undefined;
  const joined = added
    ? staff.find((member) => String(member._id) === added)
    : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Owner"
        title="Staff & roles"
        lead="Give someone a staff role, change what they can do, or stop them signing in."
        aside={
          <span className="live-chip">
            {staff.filter((member) => member.active).length} can sign in
          </span>
        }
      />

      {editing && (
        <div className="panel adjust-panel" id="edit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Edit access</span>
              <h2>{editing.name}</h2>
            </div>
            <Link href="/super-admin/staff" className="text-button">
              Close
            </Link>
          </div>
          {String(editing._id) === actor.id ? (
            <p className="notice">
              This is your own account. Change your name and password from your
              account page; your role can only be changed by another owner, so
              the store is never left without one.
            </p>
          ) : (
            <ActionForm
              action={staffAction}
              submit="Save access"
              confirmMessage={`This can change ${editing.name}'s role, what they can do and whether they can sign in. Open sessions end if access is removed.`}
            >
              <input type="hidden" name="operation" value="update" />
              <input type="hidden" name="staffId" value={String(editing._id)} />
              <div className="staff-form-grid">
                <label>
                  Name
                  <input name="name" defaultValue={editing.name} required />
                </label>
                <label>
                  Work email
                  <input
                    name="email"
                    type="email"
                    defaultValue={editing.email}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    defaultValue={editing.phone}
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    required
                  />
                </label>
                <label>
                  Role
                  <select
                    name="role"
                    defaultValue={
                      staffRoleOf(editing.roles as Role[]) ?? "customer"
                    }
                  >
                    {staffRoles.map((role) => (
                      <option key={role} value={role}>
                        {labels[role]}
                      </option>
                    ))}
                    <option value="customer">
                      No staff role (customer only)
                    </option>
                  </select>
                </label>
                <label>
                  New password{" "}
                  <small>Leave blank to keep the current one</small>
                  <PasswordInput
                    name="password"
                    autoComplete="new-password"
                    required={false}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing.active}
                  />{" "}
                  Can sign in
                </label>
              </div>
            </ActionForm>
          )}
          <RecordHistory
            target={String(editing._id)}
            title="Changes to this account"
          />
        </div>
      )}

      <div className="panel" id="add">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Add to the team</span>
            <h2>Add a staff member</h2>
          </div>
        </div>
        <p className="muted">
          Pick someone who already has an account with the store. They keep
          their account and sign in the same way, with the staff role added.
        </p>
        <form
          className="order-search"
          role="search"
          aria-label="Find an account"
          action="/super-admin/staff#add"
        >
          <label className="sr-only" htmlFor="staff-find">
            Name, phone or email
          </label>
          <input
            id="staff-find"
            name="find"
            defaultValue={term}
            placeholder="Name, phone or email"
            maxLength={60}
          />
          <button className="secondary-button compact-button">Find</button>
          {term && (
            <Link href="/super-admin/staff#add" className="text-button">
              Clear
            </Link>
          )}
        </form>
        <p className="results-line">
          <span>
            {term ? (
              <>
                <strong>{candidates.length}</strong>{" "}
                {candidates.length === 1 ? "account matches" : "accounts match"}{" "}
                “{term}”
              </>
            ) : (
              "Newest accounts. Search to find anyone else."
            )}
          </span>
        </p>
        <DataTable
          bare
          caption="Accounts without a staff role, with a role to give each one"
          rows={candidates}
          rowKey={(person) => String(person._id)}
          columns={[
            {
              header: "Person",
              cell: (person) => (
                <span className="product-cell">
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {[
                        person.phone,
                        person.email?.endsWith(".invalid")
                          ? null
                          : person.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </span>
              ),
            },
            {
              header: "Joined",
              cell: (person) => <When at={person.createdAt} />,
            },
            {
              header: "Add as",
              cell: (person) => (
                <ActionForm
                  action={staffAction}
                  submit="Add to team"
                  className="form-stack inline-grant"
                  buttonClassName="secondary-button compact-button"
                  confirmMessage={`${person.name} will be able to open the store workspace with the role you picked. You can change or remove it later.`}
                >
                  <input type="hidden" name="operation" value="grant" />
                  <input
                    type="hidden"
                    name="userId"
                    value={String(person._id)}
                  />
                  <label className="sr-only" htmlFor={`role-${person._id}`}>
                    Role for {person.name}
                  </label>
                  <select
                    id={`role-${person._id}`}
                    name="role"
                    defaultValue="admin"
                  >
                    {staffRoles.map((role) => (
                      <option key={role} value={role}>
                        {labels[role]}
                      </option>
                    ))}
                  </select>
                </ActionForm>
              ),
            },
          ]}
          empty={
            <EmptyState
              icon={UsersRound}
              title={term ? "Nobody matches" : "No other accounts yet"}
              body={
                term
                  ? "Check the spelling or search by phone. If they have never signed up, create an account below."
                  : "When customers sign up they appear here, ready to be added."
              }
              heading="h3"
            />
          }
        />
      </div>

      <details className="panel create-staff">
        <summary>Not in the list? Create a new account</summary>
        <ActionForm action={staffAction} submit="Create staff account">
          <input type="hidden" name="operation" value="create" />
          <p className="muted">
            If this mobile number already has a customer account, the role is
            added to it and the other fields are optional. Otherwise all fields
            create a new account.
          </p>
          <div className="staff-form-grid">
            <label>
              Phone
              <input
                name="phone"
                inputMode="numeric"
                pattern="[0-9]{10}"
                required
              />
            </label>
            <label>
              Role
              <select name="role">
                {staffRoles.map((role) => (
                  <option key={role} value={role}>
                    {labels[role]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input name="name" minLength={2} maxLength={80} />
            </label>
            <label>
              Work email
              <input name="email" type="email" maxLength={180} />
            </label>
            <label>
              Temporary password
              <PasswordInput
                name="password"
                autoComplete="new-password"
                required={false}
              />
            </label>
          </div>
        </ActionForm>
      </details>

      <div className="staff-layout" id="team">
        <div>
          {joined && (
            <p className="success-message" role="status">
              {joined.name} is now on the team as{" "}
              {labels[staffRoleOf(joined.roles as Role[]) ?? ""] ?? "staff"}.
            </p>
          )}
          <DataTable
            caption="Team accounts with role and whether they can sign in"
            rows={staff}
            rowKey={(member) => String(member._id)}
            columns={[
              {
                header: "Person",
                cell: (member) => (
                  <span className="product-cell">
                    <span>
                      <strong>
                        {member.name}
                        {String(member._id) === actor.id ? " (you)" : ""}
                      </strong>
                      <small>{member.email}</small>
                    </span>
                  </span>
                ),
              },
              { header: "Phone", cell: (member) => member.phone ?? "—" },
              {
                header: "Role",
                cell: (member) => (
                  <StatusPill>
                    {labels[staffRoleOf(member.roles as Role[]) ?? ""] ??
                      "Customer"}
                  </StatusPill>
                ),
              },
              {
                header: "Sign-in",
                cell: (member) =>
                  member.active ? (
                    <StatusPill tone="ok">Can sign in</StatusPill>
                  ) : (
                    <StatusPill tone="bad">Paused</StatusPill>
                  ),
              },
              {
                header: "Action",
                cell: (member) => (
                  <Link
                    href={`/super-admin/staff?edit=${member._id}#edit`}
                    aria-label={`Edit ${member.name}`}
                  >
                    Edit
                  </Link>
                ),
              },
            ]}
            empty={
              <EmptyState
                icon={UsersRound}
                title="No staff yet"
                body="Add the first staff member above."
                heading="h3"
              />
            }
          />
        </div>
        <aside className="panel permission-panel">
          <span className="eyebrow">Role guide</span>
          <h2>What each role can do</h2>
          {staffRoles.map((role) => (
            <details key={role} open={role !== "super-admin"}>
              <summary>{labels[role]}</summary>
              <p className="muted">{SUMMARY[role]}</p>
              <ul>
                {grants[role as Role]
                  .filter((grant) => CAN[grant as Permission])
                  .map((grant) => (
                    <li key={grant}>{CAN[grant as Permission]}</li>
                  ))}
              </ul>
            </details>
          ))}
          <p className="muted">
            Every change to staff access is written to the audit trail.
          </p>
        </aside>
      </div>
    </section>
  );
}
