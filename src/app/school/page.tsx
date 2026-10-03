import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PauseCircle, School as SchoolIcon, SearchX } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { schoolContext } from "@/lib/schools/membership";
import { School, SchoolAccessRequest } from "@/lib/schools/models";
import { schoolAisles, schoolCatalog } from "@/lib/schools/catalog";
import { quoteBasketView } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { schoolHref } from "@/lib/schools/display";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { SchoolNav, QuoteBar } from "@/components/school-nav";
import { SchoolProductCard } from "@/components/school-product-card";
export const metadata = { title: "School account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const REQUEST_STATE: Record<string, { label: string; tone: "warn" | "ok" | "bad" | "neutral" }> = {
  pending: { label: "Waiting for the store", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  declined: { label: "Declined", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/**
 * The school area's front door. Someone who represents a school sees its catalogue; someone in
 * several picks one; anyone else gets what the area is for and where their own requests stand.
 */
export default async function SchoolHome({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; q?: string; category?: string; pick?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect(`/login?then=${encodeURIComponent("/school")}`);
  const params = await searchParams;
  const context = await schoolContext(user.id, params.pick ? undefined : params.s);
  if (context.foreign) notFound();

  if (!context.schools.length) {
    const requests = await SchoolAccessRequest.find({ userId: user.id }).sort({ createdAt: -1 }).limit(20);
    const names = await School.find({ _id: { $in: requests.map((r) => r.schoolId) } }).select("name");
    const nameOf = (id: unknown) => names.find((school) => String(school._id) === String(id))?.name ?? "A school";
    return (
      <section className="page-container">
        <PageHeading
          eyebrow="School quotations"
          title="School account"
          lead="Schools that buy from the store in bulk ask for quotations here. Their representatives see a school catalogue, fill one shared basket and get the store’s prices with GST."
        />
        <EmptyState
          icon={SchoolIcon}
          title="You don’t represent a school yet"
          body="Ask your school for its join link from the store, open it and ask for access. The store can also add you directly."
          action={
            <Link href="/" className="secondary-button">
              Go to the shop
            </Link>
          }
        />
        {requests.length > 0 && (
          <section className="panel" aria-labelledby="my-requests">
            <h2 id="my-requests">Your requests</h2>
            <DataTable
              bare
              caption="Your requests to represent a school"
              rows={requests}
              rowKey={(request) => String(request._id)}
              columns={[
                { header: "School", cell: (request) => <strong>{nameOf(request.schoolId)}</strong> },
                { header: "Asked", cell: (request) => <When at={request.createdAt} /> },
                {
                  header: "Status",
                  cell: (request) => {
                    const state = REQUEST_STATE[request.state] ?? REQUEST_STATE.pending;
                    return (
                      <span>
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                        {request.state === "declined" && request.reason ? <small> {request.reason}</small> : null}
                      </span>
                    );
                  },
                },
                {
                  header: "Action",
                  cell: (request) =>
                    request.state === "pending" ? (
                      <ActionForm
                        action={schoolRepAction}
                        submit="Withdraw"
                        className="form-stack inline-grant"
                        buttonClassName="secondary-button compact-button"
                      >
                        <input type="hidden" name="intent" value="withdraw-access" />
                        <input type="hidden" name="requestId" value={String(request._id)} />
                      </ActionForm>
                    ) : (
                      "None"
                    ),
                },
              ]}
            />
          </section>
        )}
      </section>
    );
  }

  const current = context.current;
  if (!current || !current.active) {
    const usable = context.schools.filter((school) => school.active);
    return (
      <section className="page-container">
        <PageHeading eyebrow="School quotations" title="School account" lead="Choose the school you’re working for." />
        {current && !current.active && (
          <p className="notice school-paused" role="status">
            <PauseCircle size={18} aria-hidden="true" /> {current.name} is paused by the store for now. Its basket and
            quotations come back when the store resumes it.
          </p>
        )}
        {usable.length ? (
          <ul className="school-picker">
            {usable.map((school) => (
              <li key={school.id}>
                <Link href={schoolHref("/school", school.id)} className="panel">
                  <SchoolIcon size={22} aria-hidden="true" />
                  <strong>{school.name}</strong>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={PauseCircle}
            title="Your school is paused"
            body="The store has paused the school area for now. Ask the store if you expected it to be open."
            action={
              <Link href="/" className="secondary-button">
                Go to the shop
              </Link>
            }
          />
        )}
      </section>
    );
  }

  const [products, aisles, basket] = await Promise.all([
    schoolCatalog({ q: params.q?.slice(0, 100), category: params.category?.slice(0, 60) }),
    schoolAisles(),
    quoteBasketView(current.id),
  ]);
  const inBasket = Object.fromEntries(basket.lines.map((line) => [line.variantId, line.quantity]));
  const filtered = Boolean(params.q || params.category);
  return (
    <section className="page-container school-area">
      <SchoolNav
        school={current}
        current="catalogue"
        basketLines={basket.lines.length + basket.unavailable.length}
        otherSchools={context.schools.length > 1}
      />
      <PageHeading
        title="School catalogue"
        lead="Prices are before GST and are what to expect; the store confirms them on the quotation. Add what you need, then ask for a quotation from the basket."
      />
      <form className="order-search school-search" role="search" aria-label="Search the school catalogue" action="/school">
        <input type="hidden" name="s" value={current.id} />
        {params.category && <input type="hidden" name="category" value={params.category} />}
        <label className="sr-only" htmlFor="school-q">
          Search
        </label>
        <input id="school-q" name="q" defaultValue={params.q} placeholder="Search notebooks, pens, chalk…" maxLength={100} />
        <button className="secondary-button compact-button">Search</button>
      </form>
      {aisles.length > 1 && (
        <nav className="catalog-chips" aria-label="School catalogue aisles">
          <Link href={schoolHref("/school", current.id, { q: params.q })} aria-current={!params.category ? "page" : undefined}>
            All
          </Link>
          {aisles.map((aisle) => (
            <Link
              key={aisle.slug}
              href={schoolHref("/school", current.id, { q: params.q, category: aisle.slug })}
              aria-current={params.category === aisle.slug ? "page" : undefined}
            >
              {aisle.en}
            </Link>
          ))}
        </nav>
      )}
      <div className="results-line">
        <p>
          <strong>{products.length}</strong> {products.length === 1 ? "product" : "products"}
          {params.q ? ` for “${params.q}”` : ""}
        </p>
        {filtered && <Link href={schoolHref("/school", current.id)}>Clear search</Link>}
      </div>
      {products.length ? (
        <div className="product-grid school-grid">
          {products.map((product, index) => (
            <SchoolProductCard key={product.id} product={product} schoolId={current.id} inBasket={inBasket} eager={index === 0} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchX}
          title={filtered ? "Nothing matches" : "The school catalogue is being set up"}
          body={
            filtered
              ? "Try another word, or clear the search. Ask the store if you need something that isn’t listed."
              : "The store hasn’t listed school items yet. You’ll see them here once it does."
          }
          action={
            filtered ? (
              <Link href={schoolHref("/school", current.id)} className="primary-button">
                Show everything
              </Link>
            ) : undefined
          }
        />
      )}
      <QuoteBar schoolId={current.id} lines={basket.lines.length + basket.unavailable.length} />
    </section>
  );
}
