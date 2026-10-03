import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Role } from "../auth/permissions";
import { gstinField, gstinStateProblem, optionalField, stateField, stateName } from "../tax/gst";
import { School, SchoolAccessRequest, SchoolMember } from "./models";
import { SCHOOL_TOKEN } from "./links";
import { notifyOwners, notifyPerson } from "./notify";

/*
 * Schools, their representatives and the join link. The owner runs all of it (settings:write);
 * a signed-in person can only ask for access through a link, or withdraw their own request.
 * Every change is recorded, and notifications go out once the change is saved.
 */

const newToken = () => randomBytes(18).toString("base64url");
/** Leaves out fields that were left blank, instead of storing them as empty. */
const clean = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const DETAIL_FIELDS = ["contactName", "phone", "email", "address", "pin", "stateCode", "gstin", "notes"] as const;

async function owner(actorId: string) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  return actor;
}
async function person(userId: string) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(userId), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  return user;
}

export const schoolInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    contactName: optionalField(z.string().trim().max(80)),
    phone: optionalField(z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit phone number.")),
    email: optionalField(z.email("Enter a valid email address.")),
    address: optionalField(z.string().trim().max(300)),
    pin: optionalField(z.string().trim().regex(/^\d{6}$/, "PIN code is 6 digits.")),
    stateCode: optionalField(stateField),
    gstin: optionalField(gstinField),
    notes: optionalField(z.string().trim().max(1000)),
  })
  .superRefine((value, ctx) => {
    const problem = gstinStateProblem(value.gstin, value.stateCode);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["gstin"] });
  });

export async function createSchool(actorId: string, input: unknown) {
  await owner(actorId);
  const data = clean(schoolInput.parse(input));
  let id = "";
  await mongoose.connection.transaction(async (session) => {
    const [school] = await School.create([{ ...data, joinToken: newToken(), createdBy: actorId }], { session });
    id = String(school._id);
    await AuditLog.create([{ actorId, action: "school.create", target: id, details: { after: data } }], { session });
  });
  return { id };
}

export async function updateSchool(actorId: string, input: unknown) {
  await owner(actorId);
  const { schoolId } = z.object({ schoolId: objectId }).parse(input);
  const data = clean(schoolInput.parse(input));
  await mongoose.connection.transaction(async (session) => {
    const school = await School.findById(schoolId).session(session);
    if (!school) throw Error("This school no longer exists.");
    const before = Object.fromEntries(["name", ...DETAIL_FIELDS].map((key) => [key, school.get(key)]));
    school.set("name", data.name);
    // a box left blank clears that detail
    for (const key of DETAIL_FIELDS) school.set(key, data[key]);
    await school.save({ session });
    await AuditLog.create([{ actorId, action: "school.update", target: schoolId, details: { before, after: data } }], {
      session,
    });
  });
}

async function changeSchool(
  actorId: string,
  schoolInput: unknown,
  action: string,
  change: (school: mongoose.Document & Record<string, unknown>) => Record<string, unknown> | null,
) {
  await owner(actorId);
  const schoolId = objectId.parse(schoolInput);
  await mongoose.connection.transaction(async (session) => {
    const school = await School.findById(schoolId).session(session);
    if (!school) throw Error("This school no longer exists.");
    const details = change(school);
    if (!details) return;
    await school.save({ session });
    await AuditLog.create([{ actorId, action, target: schoolId, details }], { session });
  });
}

/** Pausing keeps everything but stops its representatives using the school area. */
export function setSchoolActive(actorId: string, input: { schoolId: unknown; active: boolean }) {
  return changeSchool(actorId, input.schoolId, input.active ? "school.resume" : "school.pause", (school) => {
    if ((school.get("active") !== false) === input.active) return null;
    school.set("active", input.active);
    return { active: input.active };
  });
}
/** A new link: the old one stops working at once. */
export function resetJoinLink(actorId: string, schoolId: unknown) {
  return changeSchool(actorId, schoolId, "school.link.reset", (school) => {
    school.set("joinToken", newToken());
    return {};
  });
}
export function setJoinOpen(actorId: string, input: { schoolId: unknown; open: boolean }) {
  return changeSchool(actorId, input.schoolId, input.open ? "school.link.open" : "school.link.close", (school) => {
    if ((school.get("joinOpen") !== false) === input.open) return null;
    school.set("joinOpen", input.open);
    return { joinOpen: input.open };
  });
}

/** The owner adds someone who already has an account; any request of theirs is settled too. */
export async function addRepresentative(actorId: string, input: unknown) {
  await owner(actorId);
  const data = z.object({ schoolId: objectId, userId: objectId }).parse(input);
  let name = "";
  let schoolName = "";
  await mongoose.connection.transaction(async (session) => {
    const school = await School.findById(data.schoolId).session(session);
    if (!school) throw Error("This school no longer exists.");
    const user = await User.findOne({ _id: data.userId, active: true }).session(session);
    if (!user) throw Error("That account is unavailable.");
    name = user.name;
    schoolName = school.name;
    if (await SchoolMember.exists({ schoolId: data.schoolId, userId: data.userId }).session(session))
      throw Error(`${user.name} already represents this school.`);
    await SchoolMember.create([{ schoolId: data.schoolId, userId: data.userId, addedBy: actorId, via: "owner" }], {
      session,
    });
    await SchoolAccessRequest.updateOne(
      { schoolId: data.schoolId, userId: data.userId, state: "pending" },
      { $set: { state: "approved", reviewerId: actorId, reviewedAt: new Date() } },
      { session },
    );
    await AuditLog.create(
      [{ actorId, action: "school.member.add", target: data.schoolId, details: { userId: data.userId, name } }],
      { session },
    );
  });
  await notifyPerson(data.userId, {
    title: `You can now ask for ${schoolName}'s quotations`,
    body: "Open the school area to see the school catalogue and fill the school's quote basket.",
    href: `/school?s=${data.schoolId}`,
  });
  return { name };
}

export async function removeRepresentative(actorId: string, input: unknown) {
  await owner(actorId);
  const data = z.object({ schoolId: objectId, userId: objectId }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const removed = await SchoolMember.deleteOne({ schoolId: data.schoolId, userId: data.userId }, { session });
    if (!removed.deletedCount) throw Error("This person no longer represents the school.");
    await AuditLog.create(
      [{ actorId, action: "school.member.remove", target: data.schoolId, details: { userId: data.userId } }],
      { session },
    );
  });
}

export async function schoolByToken(token: unknown) {
  if (typeof token !== "string" || !SCHOOL_TOKEN.test(token)) return null;
  await connectDB();
  return School.findOne({ joinToken: token });
}

const LINK_CLOSED = "This link no longer lets people join. Ask the store for a new one.";

/** Someone opened the school's link and asks to represent it; the owners decide. */
export async function requestAccess(userId: string, input: { token: unknown; message?: unknown }) {
  const user = await person(userId);
  const message = optionalField(z.string().trim().max(300)).parse(input.message);
  const school = await schoolByToken(input.token);
  if (!school || school.active === false || school.joinOpen === false) throw Error(LINK_CLOSED);
  const schoolId = String(school._id);
  if (await SchoolMember.exists({ schoolId, userId })) return { state: "member" as const, schoolId };
  if (await SchoolAccessRequest.exists({ schoolId, userId, state: "pending" })) return { state: "pending" as const, schoolId };
  try {
    await mongoose.connection.transaction(async (session) => {
      const [request] = await SchoolAccessRequest.create([{ schoolId, userId, message }], { session });
      await AuditLog.create(
        [{ actorId: userId, action: "school.access.request", target: schoolId, details: { requestId: String(request._id) } }],
        { session },
      );
    });
  } catch (error) {
    // asked twice at once: the other request stands
    if (error instanceof Error && /duplicate key/i.test(error.message)) return { state: "pending" as const, schoolId };
    throw error;
  }
  await notifyOwners({
    title: `${user.name} asked to represent ${school.name}`,
    body: message ?? "Approve or decline it on the school's page.",
    href: `/super-admin/schools/${schoolId}#requests`,
  });
  return { state: "pending" as const, schoolId };
}

export async function withdrawAccessRequest(userId: string, requestInput: unknown) {
  await person(userId);
  const requestId = objectId.parse(requestInput);
  await mongoose.connection.transaction(async (session) => {
    const request = await SchoolAccessRequest.findOneAndUpdate(
      { _id: requestId, userId, state: "pending" },
      { $set: { state: "withdrawn" } },
      { session, returnDocument: "after" },
    );
    if (!request) throw Error("This request is no longer waiting.");
    await AuditLog.create(
      [{ actorId: userId, action: "school.access.withdraw", target: String(request.schoolId), details: { requestId } }],
      { session },
    );
  });
}

export async function reviewAccessRequest(actorId: string, input: unknown) {
  await owner(actorId);
  const data = z
    .object({
      requestId: objectId,
      decision: z.enum(["approve", "decline"]),
      reason: optionalField(z.string().trim().max(300)),
    })
    .parse(input);
  let request: { schoolId: unknown; userId: unknown } | null = null;
  let schoolName = "";
  await mongoose.connection.transaction(async (session) => {
    request = await SchoolAccessRequest.findOneAndUpdate(
      { _id: data.requestId, state: "pending" },
      {
        $set: {
          state: data.decision === "approve" ? "approved" : "declined",
          reviewerId: actorId,
          reviewedAt: new Date(),
          ...(data.reason ? { reason: data.reason } : {}),
        },
      },
      { session, returnDocument: "after" },
    );
    if (!request) throw Error("This request has already been decided.");
    const { schoolId, userId } = request;
    const school = await School.findById(schoolId).session(session);
    schoolName = school?.name ?? "the school";
    if (data.decision === "approve")
      await SchoolMember.updateOne(
        { schoolId, userId },
        { $setOnInsert: { schoolId, userId, addedBy: actorId, via: "link" } },
        { upsert: true, session },
      );
    await AuditLog.create(
      [
        {
          actorId,
          action: data.decision === "approve" ? "school.access.approve" : "school.access.decline",
          target: String(schoolId),
          details: { requestId: data.requestId, userId: String(userId), reason: data.reason },
        },
      ],
      { session },
    );
  });
  const decided = request as unknown as { schoolId: unknown; userId: unknown };
  await notifyPerson(
    decided.userId,
    data.decision === "approve"
      ? {
          title: `You can now ask for ${schoolName}'s quotations`,
          body: "Open the school area to see the school catalogue and fill the school's quote basket.",
          href: `/school?s=${String(decided.schoolId)}`,
        }
      : {
          title: `Your request to represent ${schoolName} was declined`,
          body: data.reason ?? "Contact the store if this is a mistake.",
          href: "/school",
        },
  );
}

/** For the owner's pages: the state's name next to its code. */
export const schoolStateLabel = (code?: string | null) => (code ? `${stateName(code) ?? code} (${code})` : undefined);
