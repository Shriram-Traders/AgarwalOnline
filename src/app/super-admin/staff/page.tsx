import { Suspense } from "react";
import { LiveFilter } from "@/components/filter-live";
import Link from "next/link";
import mongoose from "mongoose";
import { UsersRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PolicyNotice } from "@/components/policy-notice";
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
  ownerLevel,
  pickedRole,
  accountRoles,
  staffRoles,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { User } from "@/lib/db/models";
import { staffAction } from "@/lib/staff/actions";
import { PhoneInput } from "@/components/phone-input";
export const metadata = { title: "Staff & roles", robots: { index: false } };

const labels: Record<string, string> = {
  delivery: "Delivery partner",
  admin: "Admin",
  "super-admin": "Owner",
  tech: "Tech",
};
const ROLE_OPTION = {
  customer: "Customer",
  delivery: "Delivery partner",
  admin: "Admin",
  "super-admin": "Owner (super admin)",
  tech: "Tech (owner and the site's own settings)",
} as const;
/** The same five roles, in the same order, in every picker on this page. */
const roleOptions = accountRoles.map((role) => (
  <option key={role} value={role}>
    {ROLE_OPTION[role]}
  </option>
));
/**
 * For someone who isn't staff yet nothing is picked: a picker already showing "Admin" read as if
 * they were one. The owner chooses, then Save role.
 */
const pickARole = (roles: readonly (keyof typeof ROLE_OPTION)[]) => [
  <option key="" value="" disabled>
    Pick a role
  </option>,
  ...roles.map((role) => (
    <option key={role} value={role}>
      {ROLE_OPTION[role]}
    </option>
  )),
];
const SUMMARY: Record<string, string> = {
  delivery:
    "Delivers the orders assigned to them and records the cash they collect.",
  admin:
    "Runs the day: orders, packing, delivery, catalog, stock, customers and support.",
  "super-admin":
    "Everything an admin does, plus settings, staff, approvals, offers, refunds and the audit trail.",
  tech: "Everything an owner does, including purchase prices and profit, plus the site's own settings: the developer and team credits in the footer.",
};
/** What each permission lets a person do, in the words the owner would use. */
const CAN: Partial<Record<Permission, string>> = {
  "delivery:assigned": "See and complete their assigned deliveries",
  "cod:collect": "Record cash collected at the door",
  "order:manage": "Confirm, pack and complete orders",
  "packing:write": "Fill in packing checklists",
  "delivery:assign": "Assign delivery partners",
  "cod:reconcile": "Reconcile cash handovers",
  "catalog:write": "Edit products, categories and school kits",
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

/** Accounts made from a phone number get a stand-in address like 9000000001@phone.ags.invalid. */
const placeholderEmail = (email?: string) => !email || email.endsWith(".invalid");

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
  // a search for someone already on the team (yourself included) points at their row instead of saying "nobody"
  const onTeam = pattern
    ? staff.filter((member) => [member.name, member.phone, member.email].some((value) => value && pattern.test(String(value))))
    : [];
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
            <>
              <p className="notice">
                This is your own account. Change your name and password from your
                account page. Another owner changes your role, so the store is
                never left without one; the one exception is moving between Owner
                and Tech, which both keep every owner&rsquo;s power.
              </p>
              {ownerLevel(pickedRole(editing.roles as Role[])) && (
                <ActionForm action={staffAction} submit="Save my role" className="form-stack own-role">
                  <input type="hidden" name="operation" value="own-role" />
                  <label>
                    Your role
                    <select name="role" defaultValue={pickedRole(editing.roles as Role[]) ?? "super-admin"}>
                      <option value="super-admin">{ROLE_OPTION["super-admin"]}</option>
                      <option value="tech">{ROLE_OPTION.tech}</option>
                    </select>
                  </label>
                </ActionForm>
              )}
            </>
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
                  Work email{" "}
                  {placeholderEmail(editing.email) && <small>None yet</small>}
                  <input
                    name="email"
                    type="email"
                    defaultValue={placeholderEmail(editing.email) ? "" : editing.email}
                    required={!placeholderEmail(editing.email)}
                  />
                </label>
                <label>
                  Phone {!editing.phone && <small>Optional: this account has no number yet</small>}
                  <PhoneInput
                    defaultValue={editing.phone}
                    pattern="[0-9]{10}"
                    required={Boolean(editing.phone)}
                  />
                </label>
                <label>
                  Role
                  <select
                    name="role"
                    defaultValue={
                      pickedRole(editing.roles as Role[]) ?? "customer"
                    }
                  >
                    {roleOptions}
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
          <Suspense fallback={null}>
            <LiveFilter />
          </Suspense>
          <button className="secondary-button compact-button">Find</button>
          {term && (
            <Link href="/super-admin/staff#add" className="text-button">
              Clear
            </Link>
          )}
        </form>
        {onTeam.length > 0 && (
          <p className="notice">
            Already on the team:{" "}
            {onTeam.map((member, index) => (
              <span key={String(member._id)}>
                {index > 0 && ", "}
                <Link href={`/super-admin/staff?edit=${member._id}#edit`}>
                  {member.name}
                  {String(member._id) === actor.id ? " (you)" : ""}
                </Link>{" "}
                ({labels[pickedRole(member.roles as Role[]) ?? ""] ?? "staff"})
              </span>
            ))}
            . Change a role from the team list below.
          </p>
        )}
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
              // this list only holds accounts without a staff role
              header: "Role now",
              text: () => "Customer",
              cell: () => <StatusPill>Customer</StatusPill>,
            },
            {
              // they have no staff role yet: this is where one is given
              header: "Give a role",
              cell: (person) => (
                <ActionForm
                  action={staffAction}
                  submit="Save role"
                  className="form-stack inline-grant"
                  buttonClassName="secondary-button compact-button"
                  confirmMessage={`${person.name} gets the role you picked: a staff role opens the store workspace. You can change it later.`}
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
                    defaultValue=""
                    required
                  >
                    {pickARole(staffRoles)}
                  </select>
                </ActionForm>
              ),
            },
          ]}
          empty={
            <EmptyState
              icon={UsersRound}
              title={onTeam.length ? "Nobody new matches" : term ? "Nobody matches" : "No other accounts yet"}
              body={
                onTeam.length
                  ? "Everyone this matches is already on the team, listed above."
                  : term
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
        <ActionForm
          action={staffAction}
          submit="Create account"
          confirmMessage="The account on this phone number gets the role you picked. You can change it later."
        >
          <input type="hidden" name="operation" value="create" />
          <p className="muted">
            If this mobile number already has an account, it gets the role you
            pick and the other fields are optional. Otherwise all fields create a
            new account.
          </p>
          <PolicyNotice kind="staff" />
          <div className="staff-form-grid">
            <label>
              Phone
              <PhoneInput pattern="[0-9]{10}" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="" required>
                {pickARole(accountRoles)}
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
              {labels[pickedRole(joined.roles as Role[]) ?? ""] ?? "staff"}.
            </p>
          )}
          <DataTable
            caption="Team accounts with role and whether they can sign in"
            rows={staff}
            rowKey={(member) => String(member._id)}
            columns={[
              {
                header: "Person",
                text: (member) => member.name,
                cell: (member) => (
                  <>
                    <Link href={`/super-admin/staff?edit=${member._id}#edit`}>
                      {member.name}
                      {String(member._id) === actor.id ? " (you)" : ""}
                    </Link>
                    <small>
                      {[placeholderEmail(member.email) ? "No email yet" : member.email, member.phone].filter(Boolean).join(" · ")}
                    </small>
                  </>
                ),
              },
              {
                header: "Role",
                cell: (member) => (
                  <StatusPill>
                    {labels[pickedRole(member.roles as Role[]) ?? ""] ??
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
                // the name opens the same panel; this says so out loud
                header: "Access",
                text: () => "",
                cell: (member) =>
                  String(member._id) === actor.id ? (
                    <Link href={`/super-admin/staff?edit=${member._id}#edit`} className="secondary-button compact-button">
                      Change my role
                    </Link>
                  ) : (
                    <Link href={`/super-admin/staff?edit=${member._id}#edit`} className="secondary-button compact-button">
                      Change role
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
            <details key={role} open>
              <summary>{labels[role]}</summary>
              <p className="muted">{SUMMARY[role]}</p>
              {/* an owner can do everything: the summary says so, a list of every permission would just be long */}
              {role !== "super-admin" && role !== "tech" && (
                <ul>
                  {grants[role as Role]
                    .filter((grant) => CAN[grant as Permission])
                    .map((grant) => (
                      <li key={grant}>{CAN[grant as Permission]}</li>
                    ))}
                </ul>
              )}
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
