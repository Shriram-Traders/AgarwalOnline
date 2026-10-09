import "server-only";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { currentLocale } from "@/lib/i18n";
import { LEGAL_DOCS } from "@/lib/legal/docs";
import { legalFacts } from "@/lib/legal/facts";
import { LEGAL_PAGES, POLICIES_HOME, type LegalKey } from "@/lib/legal/pages";
import type { Block, LegalDoc } from "@/lib/legal/types";
import { LAST_UPDATED, POLICY_VERSION } from "@/lib/legal/version";
import type { Locale } from "@/lib/locale-types";
import { LegalText } from "./legal-text";
import { PageHeading } from "./page-heading";
import { PolicyScroll } from "./policy-scroll";

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string")
    return (
      <p>
        <LegalText text={block} />
      </p>
    );
  if ("list" in block)
    return (
      <ul>
        {block.list.map((item, i) => (
          <li key={i}>
            <LegalText text={item} />
          </li>
        ))}
      </ul>
    );
  // label/value rows as a list, not a table: nothing scrolls sideways on a phone
  return (
    <dl className="legal-rows">
      {block.rows.map(([label, value], i) => (
        <div key={i}>
          <dt>{label}</dt>
          <dd>
            <p>
              <LegalText text={value} />
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Last updated 10 October 2026 · Version 2026-10-10", on the policy home and every policy. */
export function LegalMeta({ locale }: { locale: Locale }) {
  return (
    <p className="legal-meta">
      {locale === "mr"
        ? `शेवटचा बदल: ${LAST_UPDATED.mr} · आवृत्ती ${POLICY_VERSION}`
        : `Last updated ${LAST_UPDATED.en} · Version ${POLICY_VERSION}`}
    </p>
  );
}

/** The section's tabs: all policies, then each one, the page you're on marked. */
function PolicySwitcher({ locale, current }: { locale: Locale; current?: LegalKey }) {
  return (
    <nav className="catalog-admin-nav policy-switcher" aria-label={POLICIES_HOME.title[locale]}>
      <Link href={POLICIES_HOME.href} aria-current={current ? undefined : "page"}>
        {locale === "mr" ? "सर्व धोरणे" : "All policies"}
      </Link>
      {LEGAL_PAGES.map((page) => (
        <Link key={page.key} href={page.href} aria-current={page.key === current ? "page" : undefined}>
          {page.title[locale]}
        </Link>
      ))}
    </nav>
  );
}

/** Previous and Next, so the policies can be read one after another; the ends lead back to the list. */
function PolicyPager({ locale, current }: { locale: Locale; current: LegalKey }) {
  const mr = locale === "mr";
  const at = LEGAL_PAGES.findIndex((page) => page.key === current);
  const home = { href: POLICIES_HOME.href, title: { en: "All policies", mr: "सर्व धोरणे" } };
  const previous = LEGAL_PAGES[at - 1] ?? home;
  const next = LEGAL_PAGES[at + 1] ?? home;
  return (
    <nav className="legal-pager" aria-label={mr ? "धोरणे एकामागून एक" : "Read the policies in order"}>
      <Link href={previous.href} rel={at > 0 ? "prev" : undefined}>
        <small>{mr ? "मागील" : "Previous"}</small>
        <span>
          <ArrowLeft size={16} aria-hidden="true" /> {previous.title[locale]}
        </span>
      </Link>
      <Link href={next.href} rel={at < LEGAL_PAGES.length - 1 ? "next" : undefined} className="legal-pager-next">
        <small>{mr ? "पुढील" : "Next"}</small>
        <span>
          {next.title[locale]} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </Link>
    </nav>
  );
}

/** A policy page: heading with version, the section's tabs, contents, the text, then Previous/Next. */
export function LegalPage({ doc, locale, current }: { doc: LegalDoc; locale: Locale; current: LegalKey }) {
  const mr = locale === "mr";
  return (
    <section className="page-container legal-page">
      <PageHeading eyebrow={POLICIES_HOME.title[locale]} title={doc.title} lead={doc.lead} />
      <LegalMeta locale={locale} />
      <PolicySwitcher locale={locale} current={current} />
      {mr && (
        <p className="notice legal-prevails">
          हे इंग्रजी मजकुराचे मराठी भाषांतर आहे. दोन्हींमध्ये फरक असल्यास इंग्रजी आवृत्ती ग्राह्य धरली जाईल.
        </p>
      )}
      <div className="legal-layout">
        <nav className="legal-toc" aria-label={mr ? "या पानावर" : "On this page"}>
          <h2>{mr ? "या पानावर" : "On this page"}</h2>
          <ol>
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="legal-prose">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.blocks.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </section>
          ))}
          <PolicyPager locale={locale} current={current} />
        </article>
      </div>
      <PolicyScroll />
    </section>
  );
}

/** The policy home: every policy with its one-line summary, the tabs on top. */
export function PolicyHome({ locale, docs }: { locale: Locale; docs: { key: LegalKey; lead: string }[] }) {
  const mr = locale === "mr";
  return (
    <>
      <PolicySwitcher locale={locale} />
      <PolicyScroll />
      <ol className="policy-list">
        {LEGAL_PAGES.map((page, i) => (
          <li key={page.key}>
            <Link className="account-tile" href={page.href}>
              <span className="account-tile-icon policy-number" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <strong>{page.title[locale]}</strong>
                <small>{docs.find((doc) => doc.key === page.key)?.lead}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      <p className="muted">
        <LegalText
          text={
            mr
              ? "यापैकी कशाबद्दलही प्रश्न आहे? [दुकानाशी बोला](/account/support) किंवा [संपर्क व तक्रार निवारण](/p/contact-and-grievance) वरील तक्रार निवारण अधिकाऱ्याला लिहा."
              : "Questions about any of these? [Talk to the store](/account/support), or write to the grievance officer on [Contact & Grievance](/p/contact-and-grievance)."
          }
        />
      </p>
    </>
  );
}

/** The metadata and page for one policy route, so each `page.tsx` stays three lines. */
export function legalRoute(key: LegalKey) {
  const load = async () => {
    const [locale, facts] = await Promise.all([currentLocale(), legalFacts()]);
    return { locale, doc: LEGAL_DOCS[key][locale](facts) };
  };
  return {
    async generateMetadata(): Promise<Metadata> {
      const { doc } = await load();
      return { title: doc.title, description: doc.lead };
    },
    async Page() {
      const { locale, doc } = await load();
      return <LegalPage doc={doc} locale={locale} current={key} />;
    },
  };
}
