import mongoose from "mongoose";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Role } from "../auth/permissions";
import { DEFAULT_TAX_PROFILE, taxProfileSchema, type TaxProfile } from "./gst";

const KEY = "tax-details";

/** The shop's legal name, GSTIN and address for quotations; the defaults until the owner saves them. */
export async function taxProfile(): Promise<TaxProfile & { configured: boolean }> {
  await connectDB();
  const setting = await SystemSetting.findOne({ key: KEY });
  const saved = taxProfileSchema.safeParse(setting?.value);
  return saved.success ? { ...saved.data, configured: true } : { ...DEFAULT_TAX_PROFILE, configured: false };
}

export async function saveTaxProfile(actorId: string, input: unknown) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  // fields left blank are left out, not stored as empty
  const after = JSON.parse(JSON.stringify(taxProfileSchema.parse(input))) as TaxProfile;
  await mongoose.connection.transaction(async (session) => {
    const before = (await SystemSetting.findOne({ key: KEY }).session(session))?.value ?? null;
    await SystemSetting.updateOne(
      { key: KEY },
      { $set: { value: after }, $inc: { version: 1 } },
      { upsert: true, session },
    );
    await AuditLog.create([{ actorId, action: "tax-details.update", target: KEY, details: { before, after } }], {
      session,
    });
  });
}
