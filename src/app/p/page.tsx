import type { Metadata } from "next";
import { LegalMeta, PolicyHome } from "@/components/legal-page";
import { PageHeading } from "@/components/page-heading";
import { currentLocale } from "@/lib/i18n";
import { LEGAL_DOCS } from "@/lib/legal/docs";
import { legalFacts } from "@/lib/legal/facts";
import { LEGAL_PAGES, POLICIES_HOME } from "@/lib/legal/pages";

const LEAD = {
  en: "How we handle your orders, money and personal data, all in one place. Open any policy, or read them one after another.",
  mr: "आम्ही तुमच्या ऑर्डर, पैसे आणि वैयक्तिक माहिती कशी हाताळतो, सर्व एकाच ठिकाणी. कोणतेही धोरण उघडा, किंवा एकामागून एक वाचा.",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return { title: POLICIES_HOME.title[locale], description: LEAD[locale] };
}

/** The policies' home: each of the five with a one-line summary, in reading order. */
export default async function Policies() {
  const [locale, facts] = await Promise.all([currentLocale(), legalFacts()]);
  const docs = LEGAL_PAGES.map((page) => ({ key: page.key, lead: LEGAL_DOCS[page.key][locale](facts).lead }));
  return (
    <section className="page-container legal-page">
      <PageHeading eyebrow={facts.business.legalName} title={POLICIES_HOME.title[locale]} lead={LEAD[locale]} />
      <LegalMeta locale={locale} />
      <PolicyHome locale={locale} docs={docs} />
    </section>
  );
}
