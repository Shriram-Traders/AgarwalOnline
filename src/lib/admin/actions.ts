"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import { AuditLog, SearchSynonym, ServiceArea } from "../db/models";
import { DeliverySlot, SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { rulesSchema } from "../commerce/delivery";
import { normalizeSearch } from "../catalog/search";
import type { MutationState } from "../commerce/actions";
import mongoose from "mongoose";
import { formWithPaise, paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";
function safe(e: unknown) {
  return e instanceof z.ZodError
    ? plainMessage(e)
    : "Unable to save. Check the values and try again.";
}
export async function serviceAreaAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const data = z
      .object({
        areaId: objectId,
        pincodes: z
          .string()
          .regex(
            /^\d{6}(\s*,\s*\d{6})*$/,
            "Enter comma-separated six-digit PIN codes.",
          ),
        feePaise: z.coerce.number().int().min(0).max(100000),
        codLimitPaise: z.coerce.number().int().min(0).max(10000000),
        enabled: z.enum(["on"]).optional(),
        codEnabled: z.enum(["on"]).optional(),
      })
      .parse(formWithPaise(form));
    await mongoose.connection.transaction(async (session) => {
      const before = await ServiceArea.findById(data.areaId).session(session);
      if (!before) throw Error("Not found");
      const after = {
        pincodes: [...new Set(data.pincodes.split(",").map((p) => p.trim()))],
        feePaise: data.feePaise,
        codLimitPaise: data.codLimitPaise,
        enabled: data.enabled === "on",
        codEnabled: data.codEnabled === "on",
      };
      await ServiceArea.updateOne(
        { _id: data.areaId },
        { $set: after },
        { session, runValidators: true },
      );
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "service-area.update",
            target: data.areaId,
            details: {
              before: {
                pincodes: before.pincodes,
                enabled: before.enabled,
                feePaise: before.feePaise,
                codEnabled: before.codEnabled,
                codLimitPaise: before.codLimitPaise,
              },
              after,
            },
          },
        ],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return { success: "Delivery area updated." };
  } catch (e) {
    return { error: safe(e) };
  }
}
export async function slotAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const data = z
      .object({
        areaId: objectId,
        date: z.iso.date(),
        label: z.string().trim().min(5).max(60),
        capacity: z.coerce.number().int().min(1).max(10000),
      })
      .parse(Object.fromEntries(form));
    if (!(await ServiceArea.exists({ _id: data.areaId, enabled: true })))
      return { error: "Enable the service area first." };
    await mongoose.connection.transaction(async (session) => {
      const [slot] = await DeliverySlot.create([data], { session });
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "delivery-slot.create",
            target: String(slot._id),
            details: data,
          },
        ],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return { success: "Delivery slot created." };
  } catch (e) {
    return { error: safe(e) };
  }
}
export async function rulesAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const value = rulesSchema.parse({
      cutoffHour: Number(form.get("cutoffHour")),
      freeThresholdPaise: paiseFromRupees(form.get("freeThresholdRupees")),
      blackoutDates: String(form.get("blackoutDates") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      holidays: form.getAll("holidays").map(Number),
    });
    await mongoose.connection.transaction(async (session) => {
      const before = await SystemSetting.findOne({ key: "delivery" }).session(
        session,
      );
      await SystemSetting.updateOne(
        { key: "delivery" },
        { $set: { value }, $inc: { version: 1 } },
        { upsert: true, session },
      );
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "delivery-rules.update",
            target: "delivery",
            details: { before: before?.value, after: value },
          },
        ],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return { success: "Delivery rules updated." };
  } catch (e) {
    return { error: safe(e) };
  }
}
export async function synonymAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const data = z
      .object({
        key: z
          .string()
          .trim()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
        terms: z.string().max(1000),
      })
      .parse(Object.fromEntries(form));
    const synonyms = [
      ...new Set(data.terms.split(",").map(normalizeSearch).filter(Boolean)),
    ];
    if (synonyms.length < 2 || synonyms.length > 30)
      return { error: "Enter between 2 and 30 distinct terms." };
    await mongoose.connection.transaction(async (session) => {
      const before = await SearchSynonym.findOne({ key: data.key }).session(
        session,
      );
      await SearchSynonym.updateOne(
        { key: data.key },
        { $set: { mappingType: "equivalent", synonyms, updatedBy: user.id } },
        { upsert: true, session },
      );
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "search-synonym.update",
            target: data.key,
            details: { before: before?.synonyms, after: synonyms },
          },
        ],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return {
      success: "Synonym mapping saved. Atlas indexing may take a moment.",
    };
  } catch (e) {
    return { error: safe(e) };
  }
}

export async function stockThresholdAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const value = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(form.get("threshold"));
    await mongoose.connection.transaction(async (session) => {
      const before = await SystemSetting.findOne({
        key: "large-stock-threshold",
      }).session(session);
      await SystemSetting.updateOne(
        { key: "large-stock-threshold" },
        { $set: { value }, $inc: { version: 1 } },
        { upsert: true, session },
      );
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "inventory.threshold.update",
            target: "large-stock-threshold",
            details: { before: before?.value, after: value },
          },
        ],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return { success: "Inventory approval threshold updated." };
  } catch (error) {
    return { error: safe(error) };
  }
}
