import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "../auth/session";
import { chosenSchool } from "./current";
import { schoolContext } from "./membership";

/** Where an old `?s=` link goes so the header and the page agree on the school: via /school/use. */
export function switchHref(schoolId: string, then: string) {
  return `/school/use?${new URLSearchParams({ s: schoolId, then })}`;
}

/**
 * For the pages inside the school area (basket, checkout, quotations): they need a chosen,
 * active school. Anyone without one goes to /school, which explains, offers the picker or says
 * it's paused. A `?s=` naming another of their schools switches to it first, through
 * /school/use, so the header shows the school the page is about.
 */
export async function requireSchoolPage(wanted: string | undefined, path: string) {
  const user = await currentUser();
  if (!user) redirect(`/login?then=${encodeURIComponent(path)}`);
  const preferred = await chosenSchool();
  const context = await schoolContext(user.id, wanted, preferred);
  if (context.foreign) notFound();
  // the school the header shows (see the school layout); a page about another one switches first
  const chosen = preferred ? context.schools.find((school) => school.id === preferred) : undefined;
  const usable = context.schools.filter((school) => school.active);
  const shown = chosen?.id ?? (usable.length === 1 ? usable[0].id : undefined);
  if (wanted && context.current && wanted !== shown) redirect(switchHref(wanted, path));
  if (!context.current || !context.current.active) redirect("/school");
  return { user, school: context.current, schools: context.schools };
}
