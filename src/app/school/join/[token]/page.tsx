import Link from "next/link";
import { LinkIcon, School as SchoolIcon } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { schoolByToken } from "@/lib/schools/members";
import { SchoolAccessRequest, SchoolMember } from "@/lib/schools/models";
import { schoolRepAction } from "@/lib/schools/actions";
import { schoolJoinHref } from "@/lib/schools/links";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Join a school", robots: { index: false, follow: false } };

/**
 * Where a school's join link lands. Signing in comes back here; then the person asks to
 * represent the school and the store decides. The link alone never gives access.
 */
export default async function JoinSchool({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [school, user] = await Promise.all([schoolByToken(token), currentUser()]);
  if (!school || school.active === false || school.joinOpen === false)
    return (
      <section className="page-container">
        <EmptyState
          icon={LinkIcon}
          title="This link no longer works"
          body="The store has stopped it or made a new one. Ask the store for the current link."
          action={
            <Link href="/" className="primary-button">
              Go to the shop
            </Link>
          }
        />
      </section>
    );
  const schoolId = String(school._id);
  const back = encodeURIComponent(schoolJoinHref(token));
  const [member, pending] = user
    ? await Promise.all([
        SchoolMember.exists({ schoolId, userId: user.id }),
        SchoolAccessRequest.findOne({ schoolId, userId: user.id, state: "pending" }),
      ])
    : [null, null];
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="School quotations"
        title={school.name}
        lead="Representatives of this school see its catalogue, fill one shared quote basket and get quotations from the store."
      />
      <div className="panel invite-callout school-join">
        <SchoolIcon size={28} aria-hidden="true" />
        <div>
          {member ? (
            <>
              <h2>You represent {school.name}</h2>
              <p className="muted">Open the school area to see its catalogue and quotations.</p>
            </>
          ) : pending ? (
            <>
              <h2>Your request is with the store</h2>
              <p className="muted">You’ll get a notification once it’s approved. Nothing else to do for now.</p>
            </>
          ) : user ? (
            <>
              <h2>Ask to represent {school.name}</h2>
              <p className="muted">
                The store checks every request. Add a line so they know who you are, like your role at the school.
              </p>
            </>
          ) : (
            <>
              <h2>Sign in to ask for access</h2>
              <p className="muted">Use your own account, or create one in a minute. You’ll come straight back here.</p>
            </>
          )}
        </div>
        {member ? (
          <Link className="primary-button" href={`/school?s=${schoolId}`}>
            Open the school area
          </Link>
        ) : pending ? (
          <ActionForm action={schoolRepAction} submit="Withdraw request" buttonClassName="secondary-button" className="list-inline-form">
            <input type="hidden" name="intent" value="withdraw-access" />
            <input type="hidden" name="requestId" value={String(pending._id)} />
          </ActionForm>
        ) : user ? (
          <ActionForm action={schoolRepAction} submit="Request access" className="form-stack school-request-form">
            <input type="hidden" name="intent" value="request-access" />
            <input type="hidden" name="token" value={token} />
            <label>
              A line for the store <small>Optional</small>
              <input name="message" maxLength={300} placeholder="e.g. Office in-charge, Vidya Mandir" />
            </label>
          </ActionForm>
        ) : (
          <div className="sign-in-choices">
            <Link className="primary-button" href={`/login?then=${back}`}>
              Sign in
            </Link>
            <Link className="secondary-button" href={`/signup?then=${back}`}>
              Create an account
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
