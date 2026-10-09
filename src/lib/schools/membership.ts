import type { ClientSession } from "mongoose";
import { connectDB } from "../db/connect";
import { User } from "../db/models";
import { objectId } from "../commerce/service";
import { hasPermission, type Role } from "../auth/permissions";
import { School, SchoolMember } from "./models";

/*
 * Who may shop for which school. A representative may shop only for the schools they represent;
 * the owner may shop for any school (a school that phones in its list, say). Every school page
 * and action checks this on each request; another school's id is treated as if it didn't exist,
 * so no school can learn what other schools ask for or are quoted.
 */

export type SchoolSummary = { id: string; name: string; active: boolean };

/** The owner: runs the schools, so may shop in the school marketplace for any of them. */
export async function shopsForEverySchool(userId: string) {
  await connectDB();
  const user = await User.findById(userId).select("roles").lean<{ roles?: Role[] }>();
  return hasPermission(user?.roles ?? [], "settings:write");
}

/**
 * The schools this person may shop for, paused ones included (they see a notice): the schools
 * they represent, or every school for the owner.
 */
export async function memberships(userId: string): Promise<SchoolSummary[]> {
  await connectDB();
  const owner = await shopsForEverySchool(userId);
  const rows = owner ? [] : await SchoolMember.find({ userId }).select("schoolId");
  if (!owner && !rows.length) return [];
  const schools = await School.find(owner ? {} : { _id: { $in: rows.map((row) => row.schoolId) } })
    .select("name active")
    .sort({ name: 1 });
  return schools.map((school) => ({ id: String(school._id), name: school.name, active: school.active !== false }));
}

/**
 * Whether there's an open (not paused) school this person may shop for: the shop then shows
 * them its way in ("For my school", or "For schools" for the owner).
 */
export async function representsActiveSchool(userId: string) {
  await connectDB();
  if (await shopsForEverySchool(userId)) return Boolean(await School.exists({ active: { $ne: false } }));
  const rows = await SchoolMember.find({ userId }).select("schoolId");
  if (!rows.length) return false;
  return Boolean(await School.exists({ _id: { $in: rows.map((row) => row.schoolId) }, active: { $ne: false } }));
}

/**
 * The active school whose basket this person may fill and send for a quotation: one they
 * represent, or any school for the owner. "SCHOOL_UNAVAILABLE" for anything else.
 */
export async function assertBuyer(userId: string, schoolInput: unknown, session?: ClientSession) {
  if (await shopsForEverySchool(userId)) {
    const parsed = objectId.safeParse(schoolInput);
    const school = parsed.success ? await School.findOne({ _id: parsed.data, active: true }).session(session ?? null) : null;
    if (!school) throw Error("SCHOOL_UNAVAILABLE");
    return school;
  }
  return assertMember(userId, schoolInput, session);
}

/**
 * The active school this person represents, or "SCHOOL_UNAVAILABLE" for anything else. Strictly
 * representatives: answering a quotation (accept or ask for changes) is the school's own say.
 */
export async function assertMember(userId: string, schoolInput: unknown, session?: ClientSession) {
  await connectDB();
  const parsed = objectId.safeParse(schoolInput);
  if (!parsed.success) throw Error("SCHOOL_UNAVAILABLE");
  const member = await SchoolMember.exists({ userId, schoolId: parsed.data }).session(session ?? null);
  const school = member
    ? await School.findOne({ _id: parsed.data, active: true }).session(session ?? null)
    : null;
  if (!school) throw Error("SCHOOL_UNAVAILABLE");
  return school;
}

/**
 * Which school a page is about: the one named in `?s=`, else the one they last chose (the
 * `ags_school` preference), else the only one they represent. Several schools and no choice
 * means they pick; a `?s=` that isn't theirs is "not found", while a stale choice is ignored.
 */
export async function schoolContext(userId: string, wanted?: string, preferred?: string) {
  const schools = await memberships(userId);
  if (wanted) {
    const current = schools.find((school) => school.id === wanted);
    return { schools, current: current ?? null, foreign: !current, needsPick: false };
  }
  const chosen = preferred ? schools.find((school) => school.id === preferred) : undefined;
  if (chosen) return { schools, current: chosen, foreign: false, needsPick: false };
  const usable = schools.filter((school) => school.active);
  return {
    schools,
    current: usable.length === 1 ? usable[0] : null,
    foreign: false,
    needsPick: usable.length > 1,
  };
}
