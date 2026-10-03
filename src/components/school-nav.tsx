import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { schoolHref } from "@/lib/schools/display";

type Tab = "catalogue" | "quote" | "quotations";

/** The school area's own tabs, and a way back to the picker for people in more than one school. */
export function SchoolNav({
  school,
  current,
  basketLines,
  otherSchools,
}: {
  school: { id: string; name: string };
  current: Tab;
  basketLines: number;
  otherSchools: boolean;
}) {
  const tabs: { key: Tab; href: string; label: string }[] = [
    { key: "catalogue", href: schoolHref("/school", school.id), label: "Catalogue" },
    {
      key: "quote",
      href: schoolHref("/school/quote", school.id),
      label: basketLines ? `Quote basket (${basketLines})` : "Quote basket",
    },
    { key: "quotations", href: schoolHref("/school/quotations", school.id), label: "Quotations" },
  ];
  return (
    <div className="school-bar">
      <p className="school-name">
        <span className="eyebrow">School account</span>
        <strong>{school.name}</strong>
        {otherSchools && (
          <Link href="/school?pick=1" className="text-button">
            Switch school
          </Link>
        )}
      </p>
      <nav className="catalog-chips school-tabs" aria-label="School area">
        {tabs.map((tab) => (
          <Link key={tab.key} href={tab.href} aria-current={tab.key === current ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** On phones: the basket stays a thumb away while browsing, like the shop's basket bar. */
export function QuoteBar({ schoolId, lines }: { schoolId: string; lines: number }) {
  if (!lines) return null;
  const items = `${lines} ${lines === 1 ? "item" : "items"} in the quote basket`;
  return (
    <Link href={schoolHref("/school/quote", schoolId)} className="cart-bar quote-bar" aria-label={`${items}. View basket`}>
      <span>
        <b>Quote basket</b>
        <small>{lines === 1 ? "1 item" : `${lines} items`}</small>
      </span>
      <span>
        View basket <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}
