import "server-only";
import { cookies } from "next/headers";

/** Which school someone in several last chose. Only a preference: membership is checked every time. */
export const SCHOOL_COOKIE = "ags_school";

export async function chosenSchool() {
  return (await cookies()).get(SCHOOL_COOKIE)?.value;
}
