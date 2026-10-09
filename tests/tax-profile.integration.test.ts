import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, User } from "../src/lib/db/models";
import { SystemSetting } from "../src/lib/commerce/models";
import { saveTaxProfile, taxProfile } from "../src/lib/tax/profile";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("The shop's business and tax details", () => {
  let owner: string, admin: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, SystemSetting, AuditLog]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    owner = String((await User.create({ name: "Owner", phone: "9000000081", roles: ["customer", "super-admin"] }))._id);
    admin = String((await User.create({ name: "Staff", phone: "9000000082", roles: ["customer", "admin"] }))._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("uses the defaults until the owner saves them, then the saved details", async () => {
    expect(await taxProfile()).toMatchObject({ legalName: "Agarwal General Stores", stateCode: "27", configured: false });
    await saveTaxProfile(owner, {
      legalName: "Agarwal General Stores",
      gstin: "27aapfu0939f1zv",
      address: "Main Road, Nagothane, Raigad 402106",
      stateCode: "27",
      phone: "",
      email: "",
      terms: "Payment within 15 days.",
    });
    expect(await taxProfile()).toMatchObject({ gstin: "27AAPFU0939F1ZV", terms: "Payment within 15 days.", configured: true });
    expect(await AuditLog.countDocuments({ action: "tax-details.update" })).toBe(1);
  });

  it("keeps the grievance officer for the Contact page, and still reads details saved before it existed", async () => {
    const details = { legalName: "Agarwal General Stores", address: "Main Road, Nagothane, Raigad 402106", stateCode: "27" };
    // saved before the grievance fields were added
    await SystemSetting.create({ key: "tax-details", value: details });
    expect(await taxProfile()).toMatchObject({ ...details, configured: true });
    expect((await taxProfile()).grievanceName).toBeUndefined();
    await saveTaxProfile(owner, { ...details, grievanceName: "  R. Agarwal ", grievanceDesignation: "Proprietor" });
    expect(await taxProfile()).toMatchObject({ grievanceName: "R. Agarwal", grievanceDesignation: "Proprietor" });
    // blank fields are left out, not stored as empty
    await saveTaxProfile(owner, { ...details, grievanceName: "", grievanceDesignation: "" });
    const saved = (await SystemSetting.findOne({ key: "tax-details" })).value;
    expect(saved).not.toHaveProperty("grievanceName");
    expect(saved).not.toHaveProperty("grievanceDesignation");
  });

  it("refuses a GSTIN from another state, and anyone but an owner", async () => {
    const details = { legalName: "Agarwal General Stores", gstin: "27AAPFU0939F1ZV", address: "Main Road, Nagothane", stateCode: "24" };
    await expect(saveTaxProfile(owner, details)).rejects.toThrow();
    await expect(saveTaxProfile(admin, { ...details, stateCode: "27" })).rejects.toThrow("FORBIDDEN");
  });
});
