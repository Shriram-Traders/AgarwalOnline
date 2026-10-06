import type { ClientSession } from "mongoose";
import { connectDB } from "../db/connect";
import { objectId } from "../commerce/service";
import { School, SchoolMember } from "./models";

/*
 * Who represents which school. Every school page and action a representative uses checks this
 * on each request; another school's id is treated as if it didn't exist, so nobody can learn
 * what other schools ask for or are quoted.
 */

export type SchoolSummary = { id: string; name: string; active: boolean };

/** The schools this person represents, paused ones included (they see a notice). */
export async function memberships(userId: string): Promise<SchoolSummary[]> {
  await connectDB();
  const rows = await SchoolMember.find({ userId }).select("schoolId");
  if (!rows.length) return [];
  const schools = await School.find({ _id: { $in: rows.map((row) => row.schoolId) } })
    .select("name active")
    .sort({ name: 1 });
  return schools.map((school) => ({ id: String(school._id), name: school.name, active: school.active !== false }));
}

/** Whether this person represents a school that is open (not paused): the shop shows them "For my school". */
export async function representsActiveSchool(userId: string) {
  await connectDB();
  const rows = await SchoolMember.find({ userId }).select("schoolId");
  if (!rows.length) return false;
  return Boolean(await School.exists({ _id: { $in: rows.map((row) => row.schoolId) }, active: { $ne: false } }));
}

/** The active school this person represents, or "SCHOOL_UNAVAILABLE" for anything else. */
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
