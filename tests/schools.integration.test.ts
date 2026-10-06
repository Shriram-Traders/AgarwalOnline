import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, User } from "../src/lib/db/models";
import { Notification } from "../src/lib/engagement/models";
import { School, SchoolAccessRequest, SchoolMember } from "../src/lib/schools/models";
import {
  addRepresentative,
  createSchool,
  removeRepresentative,
  requestAccess,
  resetJoinLink,
  reviewAccessRequest,
  setJoinOpen,
  setSchoolActive,
  updateSchool,
  withdrawAccessRequest,
} from "../src/lib/schools/members";
import { assertMember, memberships, representsActiveSchool, schoolContext } from "../src/lib/schools/membership";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Schools, their representatives and the join link", () => {
  let owner: string, admin: string, rep: string, other: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, School, SchoolMember, SchoolAccessRequest, AuditLog, Notification]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    owner = String((await User.create({ name: "Owner", phone: "9000000091", roles: ["customer", "super-admin"] }))._id);
    admin = String((await User.create({ name: "Staff", phone: "9000000092", roles: ["customer", "admin"] }))._id);
    rep = String((await User.create({ name: "Office In-charge", phone: "9000000093", roles: ["customer"] }))._id);
    other = String((await User.create({ name: "Parent", phone: "9000000094", roles: ["customer"] }))._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const school = async (extra: Record<string, string> = {}) =>
    (await createSchool(owner, { name: "Vidya Mandir", phone: "", gstin: "", stateCode: "27", ...extra })).id;

  it("lets only an owner add a school, and checks its GSTIN against its state", async () => {
    await expect(createSchool(admin, { name: "Vidya Mandir" })).rejects.toThrow("FORBIDDEN");
    await expect(createSchool(owner, { name: "Vidya Mandir", gstin: "27AAPFU0939F1ZV", stateCode: "24" })).rejects.toThrow(
      /GSTIN starts with 27/,
    );
    const id = await school({ gstin: "27aapfu0939f1zv", pin: "402106" });
    const saved = await School.findById(id);
    expect(saved).toMatchObject({ gstin: "27AAPFU0939F1ZV", pin: "402106", active: true, joinOpen: true });
    expect(saved.phone).toBeUndefined();
    expect(saved.joinToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    await updateSchool(owner, { schoolId: id, name: "Vidya Mandir High School", pin: "" });
    expect(await School.findById(id)).toMatchObject({ name: "Vidya Mandir High School", pin: undefined });
    expect(await AuditLog.countDocuments({ action: { $in: ["school.create", "school.update"] } })).toBe(2);
  });

  it("adds a representative straight away, once, and takes them off again", async () => {
    const id = await school();
    expect(await addRepresentative(owner, { schoolId: id, userId: rep })).toEqual({ name: "Office In-charge" });
    await expect(addRepresentative(owner, { schoolId: id, userId: rep })).rejects.toThrow("already represents");
    expect(await memberships(rep)).toEqual([{ id, name: "Vidya Mandir", active: true }]);
    expect(String((await assertMember(rep, id))._id)).toBe(id);
    expect(await Notification.countDocuments({ userId: rep })).toBe(1);
    await removeRepresentative(owner, { schoolId: id, userId: rep });
    await expect(assertMember(rep, id)).rejects.toThrow("SCHOOL_UNAVAILABLE");
    await expect(removeRepresentative(owner, { schoolId: id, userId: rep })).rejects.toThrow("no longer represents");
  });

  it("takes a request through the link, which the owner approves or declines", async () => {
    const id = await school();
    const { joinToken } = await School.findById(id);
    expect(await requestAccess(rep, { token: joinToken, message: "Office in-charge" })).toEqual({ state: "pending", schoolId: id });
    // asking again doesn't make a second request
    expect(await requestAccess(rep, { token: joinToken })).toMatchObject({ state: "pending" });
    expect(await SchoolAccessRequest.countDocuments({ schoolId: id })).toBe(1);
    expect(await Notification.countDocuments({ userId: owner })).toBe(1);
    await expect(assertMember(rep, id)).rejects.toThrow("SCHOOL_UNAVAILABLE");

    const request = await SchoolAccessRequest.findOne({ userId: rep });
    await expect(reviewAccessRequest(admin, { requestId: String(request._id), decision: "approve" })).rejects.toThrow("FORBIDDEN");
    await reviewAccessRequest(owner, { requestId: String(request._id), decision: "approve" });
    expect(await SchoolMember.findOne({ schoolId: id, userId: rep })).toMatchObject({ via: "link" });
    await expect(reviewAccessRequest(owner, { requestId: String(request._id), decision: "decline" })).rejects.toThrow(
      "already been decided",
    );
    expect(await requestAccess(rep, { token: joinToken })).toMatchObject({ state: "member" });

    await requestAccess(other, { token: joinToken });
    const second = await SchoolAccessRequest.findOne({ userId: other });
    await reviewAccessRequest(owner, { requestId: String(second._id), decision: "decline", reason: "Not on staff" });
    expect(await SchoolAccessRequest.findById(second._id)).toMatchObject({ state: "declined", reason: "Not on staff" });
    expect(await SchoolMember.exists({ schoolId: id, userId: other })).toBeNull();
    // after a decline they may ask again
    expect(await requestAccess(other, { token: joinToken })).toMatchObject({ state: "pending" });
    expect(await AuditLog.countDocuments({ action: /^school\.access\./ })).toBe(5);
  });

  it("lets a person withdraw only their own waiting request", async () => {
    const id = await school();
    const { joinToken } = await School.findById(id);
    await requestAccess(rep, { token: joinToken });
    const request = await SchoolAccessRequest.findOne({ userId: rep });
    await expect(withdrawAccessRequest(other, String(request._id))).rejects.toThrow("no longer waiting");
    await withdrawAccessRequest(rep, String(request._id));
    expect(await SchoolAccessRequest.findById(request._id)).toMatchObject({ state: "withdrawn" });
  });

  it("stops the link when it's closed, replaced or the school is paused", async () => {
    const id = await school();
    const first = (await School.findById(id)).joinToken;
    await setJoinOpen(owner, { schoolId: id, open: false });
    await expect(requestAccess(rep, { token: first })).rejects.toThrow("no longer lets people join");
    await setJoinOpen(owner, { schoolId: id, open: true });
    await resetJoinLink(owner, id);
    const second = (await School.findById(id)).joinToken;
    expect(second).not.toBe(first);
    await expect(requestAccess(rep, { token: first })).rejects.toThrow("no longer lets people join");
    await expect(requestAccess(rep, { token: "x".repeat(24) })).rejects.toThrow("no longer lets people join");

    await addRepresentative(owner, { schoolId: id, userId: rep });
    await setSchoolActive(owner, { schoolId: id, active: false });
    await expect(requestAccess(other, { token: second })).rejects.toThrow("no longer lets people join");
    await expect(assertMember(rep, id)).rejects.toThrow("SCHOOL_UNAVAILABLE");
    // a paused school still shows in their list, flagged, so the page can say why
    expect(await memberships(rep)).toEqual([{ id, name: "Vidya Mandir", active: false }]);
    expect((await schoolContext(rep)).current).toBeNull();
    await setSchoolActive(owner, { schoolId: id, active: true });
    expect(String((await assertMember(rep, id))._id)).toBe(id);
  });

  it("keeps schools apart: someone else's school id is simply not there", async () => {
    const mine = await school();
    const theirs = await school({ name: "Other School" });
    await addRepresentative(owner, { schoolId: mine, userId: rep });
    await expect(assertMember(rep, theirs)).rejects.toThrow("SCHOOL_UNAVAILABLE");
    await expect(assertMember(rep, "not-an-id")).rejects.toThrow("SCHOOL_UNAVAILABLE");
    expect(await schoolContext(rep, theirs)).toMatchObject({ foreign: true, current: null });
    expect((await schoolContext(rep)).current).toMatchObject({ id: mine });

    await addRepresentative(owner, { schoolId: theirs, userId: rep });
    expect(await schoolContext(rep)).toMatchObject({ current: null, needsPick: true });
    expect((await schoolContext(rep, theirs)).current).toMatchObject({ id: theirs });
  });

  it("remembers the school someone in several chose, but never lets the choice reach another school", async () => {
    const mine = await school();
    const second = await school({ name: "Second School" });
    const stranger = await school({ name: "Stranger School" });
    expect(await representsActiveSchool(rep)).toBe(false);
    await addRepresentative(owner, { schoolId: mine, userId: rep });
    await addRepresentative(owner, { schoolId: second, userId: rep });
    expect(await representsActiveSchool(rep)).toBe(true);
    // the remembered choice picks among their own schools
    expect(await schoolContext(rep, undefined, second)).toMatchObject({ current: { id: second }, foreign: false, needsPick: false });
    // a stale or foreign choice is ignored, not "not found": they pick again
    expect(await schoolContext(rep, undefined, stranger)).toMatchObject({ current: null, foreign: false, needsPick: true });
    // a school named in the address still wins, and still can't be someone else's
    expect((await schoolContext(rep, mine, second)).current).toMatchObject({ id: mine });
    expect(await schoolContext(rep, stranger, second)).toMatchObject({ foreign: true, current: null });
    // with every school paused there is nothing to open from the shop
    await setSchoolActive(owner, { schoolId: mine, active: false });
    await setSchoolActive(owner, { schoolId: second, active: false });
    expect(await representsActiveSchool(rep)).toBe(false);
  });
});
