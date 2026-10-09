import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { chosenSchool } from "@/lib/schools/current";
import { schoolContext } from "@/lib/schools/membership";
import { schoolAisles } from "@/lib/schools/catalog";
import { QuoteBasket } from "@/lib/schools/models";
import { SchoolHeader } from "@/components/school-header";
import { SchoolTabs } from "@/components/school-tabs";

/**
 * The school marketplace: its own header and phone tab bar around every school page, in place
 * of the shop's (AdaptiveShell leaves /school to this layout). Membership is read here for the
 * header only; every page and action still checks it for itself.
 */
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, preferred] = await Promise.all([currentUser(), currentLocale(), chosenSchool()]);
  const context = user ? await schoolContext(user.id, undefined, preferred) : null;
  const current = context?.current?.active ? context.current : null;
  const [aisles, basket] = current
    ? await Promise.all([schoolAisles(), QuoteBasket.findOne({ schoolId: current.id }).select("items").lean()])
    : [[], null];
  const basketLines = (basket as { items?: unknown[] } | null)?.items?.length ?? 0;
  return (
    <>
      <SchoolHeader
        locale={locale}
        user={user ? { name: user.name, phone: user.phone, email: user.email } : null}
        current={current ? { id: current.id, name: current.name } : null}
        others={(context?.schools ?? []).filter((school) => school.active && school.id !== current?.id)}
        aisles={aisles}
        basketLines={basketLines}
      />
      <main id="main" className="school-main-area">
        {children}
      </main>
      {current && <SchoolTabs locale={locale} basketLines={basketLines} />}
    </>
  );
}
