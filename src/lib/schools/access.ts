import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "../auth/session";
import { schoolContext } from "./membership";

/**
 * For the pages inside the school area (basket, quotations): they need a chosen, active school.
 * Anyone without one goes to /school, which explains, offers the picker or says it's paused.
 */
export async function requireSchoolPage(wanted?: string) {
  const user = await currentUser();
  if (!user) redirect(`/login?then=${encodeURIComponent("/school")}`);
  const context = await schoolContext(user.id, wanted);
  if (context.foreign) notFound();
  if (!context.current || !context.current.active) redirect("/school");
  return { user, school: context.current, schools: context.schools };
}
