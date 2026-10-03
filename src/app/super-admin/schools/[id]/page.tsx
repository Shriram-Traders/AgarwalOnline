import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, UserPlus, UsersRound } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { objectId } from "@/lib/commerce/service";
import { User } from "@/lib/db/models";
import { getEnv } from "@/lib/env";
import { School, SchoolAccessRequest, SchoolMember, QuoteRequest } from "@/lib/schools/models";
import { schoolAdminAction } from "@/lib/schools/actions";
import { schoolJoinHref } from "@/lib/schools/links";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { ShareLink } from "@/components/share-link";
import { RecordHistory } from "@/components/record-history";
import { SchoolFields } from "@/components/school-fields";
export const metadata = { title: "School", robots: { index: false } };

/** Phone-only accounts have a stand-in email like 9000000001@phone.ags.invalid. */
const contact = (person?: { phone?: string; email?: string } | null) =>
  [person?.phone, person?.email?.endsWith(".invalid") ? null : person?.email].filter(Boolean).join(" · ");

export default async function SchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ find?: string }>;
}) {
  await requirePage("settings:write");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const school = await School.findById(id);
  if (!school) notFound();
  const { find } = await searchParams;
  const term = find?.trim().slice(0, 60);
  const pattern = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const [members, requests, quoteCount] = await Promise.all([
    SchoolMember.find({ schoolId: id }).sort({ createdAt: 1 }),
    SchoolAccessRequest.find({ schoolId: id, state: "pending" }).sort({ createdAt: 1 }),
    QuoteRequest.countDocuments({ schoolId: id }),
  ]);
  const people = await User.find({
    _id: { $in: [...members.map((m) => m.userId), ...requests.map((r) => r.userId)] },
  }).select("name phone email");
  const personFor = (userId: unknown) => people.find((p) => String(p._id) === String(userId));
  const candidates = pattern
    ? await User.find({
        active: true,
        _id: { $nin: members.map((m) => m.userId) },
        $or: [{ name: pattern }, { phone: pattern }, { email: pattern }],
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .select("name phone email createdAt")
    : [];
  const paused = school.active === false;
  const linkOpen = school.joinOpen !== false;
  const joinUrl = `${getEnv().APP_ORIGIN}${schoolJoinHref(school.joinToken)}`;
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/super-admin/schools">Schools</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{school.name}</span>
      </nav>
      <PageHeading
        eyebrow="Owner"
        title={school.name}
        lead={`${members.length} ${members.length === 1 ? "representative" : "representatives"} · ${quoteCount} ${quoteCount === 1 ? "quotation request" : "quotation requests"}`}
        aside={
          <Link href={`/super-admin/quotations?school=${id}`} className="secondary-button">
            Quotations for this school
          </Link>
        }
      />
      {paused && (
        <div className="notice school-paused" role="status">
          <p>Paused: its representatives can’t use the school area or ask for quotations.</p>
          <ActionForm action={schoolAdminAction} submit="Resume school" buttonClassName="secondary-button compact-button" className="form-stack inline-grant">
            <input type="hidden" name="operation" value="resume" />
            <input type="hidden" name="schoolId" value={id} />
          </ActionForm>
        </div>
      )}

      <div className="school-layout">
        <div className="school-main">
          <section className="panel" id="requests" aria-labelledby="requests-heading">
            <h2 id="requests-heading">Access requests</h2>
            <DataTable
              bare
              caption="People asking to represent this school"
              rows={requests}
              rowKey={(request) => String(request._id)}
              columns={[
                {
                  header: "Person",
                  cell: (request) => {
                    const who = personFor(request.userId);
                    return (
                      <span className="product-cell">
                        <span>
                          <strong>{who?.name ?? "Account removed"}</strong>
                          <small>{contact(who)}</small>
                        </span>
                      </span>
                    );
                  },
                },
                { header: "Asked", cell: (request) => <When at={request.createdAt} /> },
                { header: "Message", cell: (request) => request.message ?? "No message" },
                {
                  header: "Decision",
                  cell: (request) => (
                    <span className="request-actions">
                      <ActionForm
                        action={schoolAdminAction}
                        submit="Approve"
                        className="form-stack inline-grant"
                        buttonClassName="primary-button compact-button"
                      >
                        <input type="hidden" name="operation" value="approve" />
                        <input type="hidden" name="requestId" value={String(request._id)} />
                      </ActionForm>
                      <ActionForm
                        action={schoolAdminAction}
                        submit="Decline"
                        className="form-stack inline-grant decline-form"
                        buttonClassName="secondary-button compact-button"
                      >
                        <input type="hidden" name="operation" value="decline" />
                        <input type="hidden" name="requestId" value={String(request._id)} />
                        <label className="sr-only" htmlFor={`reason-${request._id}`}>
                          Reason for declining
                        </label>
                        <input id={`reason-${request._id}`} name="reason" placeholder="Reason (optional)" maxLength={300} />
                      </ActionForm>
                    </span>
                  ),
                },
              ]}
              empty={<p className="muted">No one is waiting. People who open the join link and ask appear here.</p>}
            />
          </section>

          <section className="panel" id="representatives" aria-labelledby="reps-heading">
            <h2 id="reps-heading">Representatives</h2>
            <DataTable
              bare
              caption="People who can ask for this school's quotations"
              rows={members}
              rowKey={(member) => String(member._id)}
              columns={[
                {
                  header: "Person",
                  cell: (member) => {
                    const who = personFor(member.userId);
                    return (
                      <span className="product-cell">
                        <span>
                          <strong>{who?.name ?? "Account removed"}</strong>
                          <small>{contact(who)}</small>
                        </span>
                      </span>
                    );
                  },
                },
                {
                  header: "Joined",
                  cell: (member) => (
                    <span>
                      {member.via === "link" ? "Through the link" : "Added by you"} · <When at={member.createdAt} />
                    </span>
                  ),
                },
                {
                  header: "Action",
                  cell: (member) => (
                    <ActionForm
                      action={schoolAdminAction}
                      submit="Remove"
                      className="form-stack inline-grant"
                      buttonClassName="secondary-button compact-button"
                    >
                      <input type="hidden" name="operation" value="remove-member" />
                      <input type="hidden" name="schoolId" value={id} />
                      <input type="hidden" name="userId" value={String(member.userId)} />
                    </ActionForm>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  icon={UsersRound}
                  title="No representatives yet"
                  body="Find someone who already has an account below, or share the join link."
                  heading="h3"
                />
              }
            />
            <h3 className="finder-heading" id="add">
              <UserPlus size={18} aria-hidden="true" /> Add a representative
            </h3>
            <p className="muted">They need an account with the store first. Search by name, phone or email.</p>
            <form className="order-search" role="search" aria-label="Find an account" action={`/super-admin/schools/${id}#add`}>
              <label className="sr-only" htmlFor="school-find">
                Name, phone or email
              </label>
              <input id="school-find" name="find" defaultValue={term} placeholder="Name, phone or email" maxLength={60} />
              <button className="secondary-button compact-button">Find</button>
              {term && (
                <Link href={`/super-admin/schools/${id}#add`} className="text-button">
                  Clear
                </Link>
              )}
            </form>
            {term && (
              <DataTable
                bare
                caption="Accounts matching the search"
                rows={candidates}
                rowKey={(person) => String(person._id)}
                columns={[
                  {
                    header: "Person",
                    cell: (person) => (
                      <span className="product-cell">
                        <span>
                          <strong>{person.name}</strong>
                          <small>{contact(person)}</small>
                        </span>
                      </span>
                    ),
                  },
                  { header: "Joined", cell: (person) => <When at={person.createdAt} /> },
                  {
                    header: "Action",
                    cell: (person) => (
                      <ActionForm
                        action={schoolAdminAction}
                        submit="Add as representative"
                        className="form-stack inline-grant"
                        buttonClassName="secondary-button compact-button"
                      >
                        <input type="hidden" name="operation" value="add-member" />
                        <input type="hidden" name="schoolId" value={id} />
                        <input type="hidden" name="userId" value={String(person._id)} />
                      </ActionForm>
                    ),
                  },
                ]}
                empty={<p className="muted">Nobody matches “{term}”. They may need to sign up first.</p>}
              />
            )}
          </section>
        </div>

        <aside className="school-side">
          <section className="panel" aria-labelledby="link-heading">
            <h2 id="link-heading">Join link</h2>
            <p className="muted">
              Share it with the school. People who open it sign in and ask to represent the school; you decide.
            </p>
            {linkOpen && !paused ? (
              <ShareLink
                label="Link"
                url={joinUrl}
                hint="Anyone with it can ask; nobody gets in without your approval."
                title={`Join ${school.name} at Agarwal General Stores`}
                copy="Copy link"
                copied="Copied"
              />
            ) : (
              <p className="notice">
                {paused ? "The school is paused, so the link doesn’t work." : "The link is stopped: nobody can ask to join."}
              </p>
            )}
            <div className="split-actions">
              <ActionForm
                action={schoolAdminAction}
                submit={linkOpen ? "Stop the link" : "Let the link work again"}
                className="form-stack inline-grant"
                buttonClassName="secondary-button compact-button"
              >
                <input type="hidden" name="operation" value={linkOpen ? "link-close" : "link-open"} />
                <input type="hidden" name="schoolId" value={id} />
              </ActionForm>
              <ActionForm
                action={schoolAdminAction}
                submit="Make a new link"
                className="form-stack inline-grant"
                buttonClassName="secondary-button compact-button"
                confirmMessage="The current link stops working. Anyone who hasn’t joined yet needs the new one."
              >
                <input type="hidden" name="operation" value="reset-link" />
                <input type="hidden" name="schoolId" value={id} />
              </ActionForm>
            </div>
          </section>

          <section className="panel" aria-labelledby="details-heading">
            <h2 id="details-heading">School details</h2>
            <ActionForm action={schoolAdminAction} submit="Save school details">
              <input type="hidden" name="operation" value="update" />
              <input type="hidden" name="schoolId" value={id} />
              <SchoolFields school={school.toObject()} />
            </ActionForm>
            {!paused && (
              <ActionForm
                action={schoolAdminAction}
                submit="Pause school"
                className="form-stack inline-grant"
                buttonClassName="text-button"
                confirmMessage="Its representatives won’t be able to use the school area or ask for quotations until you resume it."
              >
                <input type="hidden" name="operation" value="pause" />
                <input type="hidden" name="schoolId" value={id} />
              </ActionForm>
            )}
            <StatusPill tone={paused ? "neutral" : "ok"}>{paused ? "Paused" : "Active"}</StatusPill>
          </section>
        </aside>
      </div>
      <RecordHistory target={id} title="Changes to this school" />
    </section>
  );
}
