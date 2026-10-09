import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  LayoutGrid,
  PauseCircle,
  School as SchoolIcon,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { categoryImages, heroImage } from "@/lib/catalog/images";
import { chosenSchool } from "@/lib/schools/current";
import { schoolContext } from "@/lib/schools/membership";
import { QuoteRequest, School, SchoolAccessRequest } from "@/lib/schools/models";
import { schoolAisles, schoolCatalog } from "@/lib/schools/catalog";
import { quoteBasketView } from "@/lib/schools/quotes";
import { schoolRepAction } from "@/lib/schools/actions";
import { switchHref } from "@/lib/schools/access";
import { quoteMoney, repStatus } from "@/lib/schools/display";
import { estimateQuote } from "@/lib/schools/estimate";
import { withQuery } from "@/lib/schools/paths";
import { ActionForm } from "@/components/action-form";
import { AisleIcon } from "@/components/aisle-icon";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { SchoolProductCard } from "@/components/school-product-card";
export const metadata = { title: "For schools", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const REQUEST_STATE: Record<string, { label: string; tone: "warn" | "ok" | "bad" | "neutral" }> = {
  pending: { label: "Waiting for the store", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  declined: { label: "Declined", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  link,
  linkLabel,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  link?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <h2 id={id}>
            <span className="section-icon">
              <Icon aria-hidden="true" />
            </span>
            {title}
          </h2>
          <span className="muted">{subtitle}</span>
        </div>
        {link && linkLabel && (
          <Link href={link}>
            {linkLabel} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The school marketplace's front door. A representative sees it like the shop's home: a
 * welcome band, the school aisles, popular items and where their quotations stand. Someone in
 * several schools picks one; anyone else learns what it's for and where their requests are.
 */
export default async function SchoolHome({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; q?: string; category?: string; pick?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect(`/login?then=${encodeURIComponent("/school")}`);
  const params = await searchParams;
  // the catalogue used to live here: old links with a search or an aisle go to it
  if (params.q || params.category)
    redirect(withQuery("/school/catalog", { q: params.q, category: params.category, s: params.s }));
  const preferred = await chosenSchool();
  const context = await schoolContext(user.id, params.pick ? undefined : params.s, params.pick ? undefined : preferred);
  if (context.foreign) notFound();
  // a link naming one of their schools: switch to it so the header agrees
  if (params.s && context.current && params.s !== preferred) redirect(switchHref(params.s, "/school"));

  // the owner shops for any school; with none added yet, the way on is to add one
  const owner = hasPermission(user.roles, "settings:write");
  if (!context.schools.length && owner)
    return (
      <section className="page-container">
        <PageHeading
          eyebrow="For schools"
          title="Agarwal for schools"
          lead="Schools shop here at school prices and ask for a quotation at checkout. As the owner you can shop for any school."
        />
        <EmptyState
          icon={SchoolIcon}
          title="Add your first school"
          body="Once a school is added you can shop for it here, and its representatives can too."
          action={
            <Link href="/super-admin/schools?edit=new#school" className="primary-button">
              Add a school
            </Link>
          }
        />
      </section>
    );

  if (!context.schools.length) {
    const requests = await SchoolAccessRequest.find({ userId: user.id }).sort({ createdAt: -1 }).limit(20);
    const names = await School.find({ _id: { $in: requests.map((r) => r.schoolId) } }).select("name");
    const nameOf = (id: unknown) => names.find((school) => String(school._id) === String(id))?.name ?? "A school";
    return (
      <section className="page-container">
        <PageHeading
          eyebrow="For schools"
          title="Agarwal for schools"
          lead="Schools that buy from the store in bulk shop here at school prices. At checkout they ask for a quotation instead of paying."
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
        <PageHeading
          eyebrow="For schools"
          title="Choose your school"
          lead={owner ? "As the owner you can shop for any school. Which one is this for?" : "Which school are you buying for today?"}
        />
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
                {/* a full page load: the header changes school too */}
                <a href={switchHref(school.id, "/school")} className="panel">
                  <SchoolIcon size={22} aria-hidden="true" />
                  <strong>{school.name}</strong>
                </a>
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

  const [products, aisles, basket, quotations] = await Promise.all([
    schoolCatalog(),
    schoolAisles(),
    quoteBasketView(current.id),
    QuoteRequest.find({ schoolId: current.id })
      .sort({ updatedAt: -1 })
      .limit(3)
      .select("number status items currentVersion versions.version versions.totalPaise versions.validUntil updatedAt"),
  ]);
  const inBasket = Object.fromEntries(basket.lines.map((line) => [line.variantId, line.quantity]));
  const estimate = estimateQuote(basket.lines);
  const counts = new Map<string, number>();
  for (const product of products) counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1);
  const latest = (request: (typeof quotations)[number]) =>
    request.versions.find((v: { version: number }) => v.version === request.currentVersion) as
      | { totalPaise: number; validUntil: string }
      | undefined;
  const ready = quotations.find((request) => repStatus(request.status, latest(request)?.validUntil).label === "Quotation ready");
  return (
    <>
      <section className="hero school-hero" aria-labelledby="school-welcome">
        <div className="hero-card">
          <Image src={categoryImages.school ?? heroImage} alt="" fill sizes="60vw" priority />
          <span className="hero-badge">
            {owner ? `Shopping for ${current.name} as the owner` : `School prices · ${current.name}`}
          </span>
          <h1 id="school-welcome">
            Everything your school needs,
            <em> priced for schools</em>
          </h1>
          <p>Fill the basket like any order. At checkout you ask for a quotation instead of paying; the store sends its prices with GST.</p>
          <div className="hero-actions">
            <Link href="/school/catalog" className="primary-button">
              Browse school items
            </Link>
            <Link href="/school/quotations" className="secondary-button">
              Your quotations
            </Link>
          </div>
        </div>
        <aside className="deal-card school-glance" aria-labelledby="glance-title">
          {ready ? (
            <>
              <span className="eyebrow">Quotation ready</span>
              <h2 id="glance-title">{ready.number}</h2>
              <p>
                {latest(ready) ? `${quoteMoney(latest(ready)!.totalPaise)} with GST. ` : ""}Accept it or ask for changes.
              </p>
              <Link href={`/school/quotations/${ready._id}`} className="primary-button">
                Review quotation
              </Link>
            </>
          ) : (
            <>
              <span className="eyebrow">Your school’s basket</span>
              <h2 id="glance-title">
                {basket.lines.length
                  ? `${basket.lines.length} ${basket.lines.length === 1 ? "item" : "items"} · ${estimate.units.toLocaleString("en-IN")} units`
                  : "Nothing in it yet"}
              </h2>
              <p>
                {basket.lines.length
                  ? `Expected ${quoteMoney(estimate.totalPaise)} with GST.`
                  : "Anyone at your school can add to it."}
              </p>
              <Link href={basket.lines.length ? "/school/basket" : "/school/catalog"} className="primary-button">
                {basket.lines.length ? "View basket" : "Start adding"}
              </Link>
            </>
          )}
        </aside>
      </section>
      <div className="page-container home school-home">
        {quotations.length > 0 && (
          <Section
            id="quotes-title"
            icon={FileText}
            title="Your quotations"
            subtitle="The latest from the store"
            link="/school/quotations"
            linkLabel="All quotations"
          >
            <ul className="school-quote-strip">
              {quotations.map((request) => {
                const version = latest(request);
                const status = repStatus(request.status, version?.validUntil);
                return (
                  <li key={String(request._id)}>
                    <Link href={`/school/quotations/${request._id}`} className="panel">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      <strong>{request.number}</strong>
                      <small>
                        {request.items.length} {request.items.length === 1 ? "item" : "items"}
                        {version ? ` · ${quoteMoney(version.totalPaise)} with GST` : ""} · <When at={request.updatedAt} />
                      </small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        {aisles.length > 0 && (
          <Section
            id="school-aisles-title"
            icon={LayoutGrid}
            title="Shop by category"
            subtitle="School items, at school prices"
            link="/school/catalog"
            linkLabel="See all"
          >
            <div className="aisles">
              {aisles.map((aisle) => (
                <Link
                  key={aisle.slug}
                  href={`/school/catalog?category=${aisle.slug}`}
                  className={`aisle-tile ${categoryImages[aisle.slug] ? "photo" : "quiet"}`}
                >
                  <span className="aisle-art">
                    {categoryImages[aisle.slug] ? (
                      <Image src={categoryImages[aisle.slug]} alt="" fill sizes="(max-width: 760px) 25vw, 200px" />
                    ) : (
                      <AisleIcon slug={aisle.slug} />
                    )}
                  </span>
                  <span className="aisle-label">
                    <strong>{aisle.en}</strong>
                    <small>
                      {counts.get(aisle.slug) ?? 0} {counts.get(aisle.slug) === 1 ? "item" : "items"}
                    </small>
                  </span>
                </Link>
              ))}
              <Link href="/school/catalog" className="aisle-tile quiet">
                <span className="aisle-art">
                  <AisleIcon slug="all" />
                </span>
                <span className="aisle-label">
                  <strong>All school items</strong>
                  <small>{products.length} items</small>
                </span>
              </Link>
            </div>
          </Section>
        )}
        {products.length > 0 ? (
          <Section
            id="school-popular-title"
            icon={Sparkles}
            title="Popular with schools"
            subtitle="Prices before GST"
            link="/school/catalog"
            linkLabel="See all"
          >
            <div className="product-grid">
              {products.slice(0, 10).map((product, index) => (
                <SchoolProductCard
                  key={product.id}
                  product={product}
                  schoolId={current.id}
                  inBasket={inBasket}
                  eager={index < 5}
                />
              ))}
            </div>
          </Section>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="The school catalogue is being set up"
            body="The store hasn’t listed school items yet. You’ll see them here once it does."
          />
        )}
        <section className="delivery-steps school-steps" aria-labelledby="school-how-title">
          <div>
            <span className="eyebrow">How it works</span>
            <h2 id="school-how-title">Shop like any order. Pay nothing here.</h2>
            <p>Everyone at {current.name} shares one basket. The store prices it and you decide.</p>
          </div>
          <ol>
            <li>
              <ShoppingBag size={22} aria-hidden="true" />
              <strong>Fill the basket</strong>
              <small>Add what your school needs, with how many</small>
            </li>
            <li>
              <FileText size={22} aria-hidden="true" />
              <strong>Create a quotation</strong>
              <small>At checkout, instead of paying</small>
            </li>
            <li>
              <ClipboardCheck size={22} aria-hidden="true" />
              <strong>Accept or ask for changes</strong>
              <small>The store arranges delivery and billing</small>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
