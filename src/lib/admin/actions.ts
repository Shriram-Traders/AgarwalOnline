"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import { AuditLog, SearchSynonym, ServiceArea } from "../db/models";
import { DeliverySlot, Order, SlotPattern, SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { istDate, rulesSchema } from "../commerce/delivery";
import { DEFAULT_TIMES_LABEL, dayLabel, ensureSlots, windowLabel } from "../commerce/slots";
import { normalizeSearch } from "../catalog/search";
import type { MutationState } from "../commerce/actions";
import mongoose from "mongoose";
import { formWithPaise, paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { saveTaxProfile } from "../tax/profile";
/** Messages these actions write for the owner; anything else is unexpected and stays generic. */
const PLAIN = /^(PIN code|An area|Switch on|Choose|The delivery|That delivery|This (area|slot|weekly)|Pick at least|Orders it can take)/;
function safe(e: unknown) {
  if (e instanceof z.ZodError) return plainMessage(e);
  const message = e instanceof Error ? e.message : "";
  if (PLAIN.test(message)) return message;
  log("error", "settings.unexpected-error", { error: e });
  return "Unable to save. Check the values and try again.";
}
const pincodeList = z
  .string()
  .regex(/^\d{6}(\s*,\s*\d{6})*$/, "Enter comma-separated six-digit PIN codes.");
/** Each PIN code belongs to one area, or checkout couldn't tell which fee and rules apply. */
async function assertPinsFree(pins: string[], areaId: string | null, session: mongoose.ClientSession) {
  const clash = await ServiceArea.findOne({
    ...(areaId ? { _id: { $ne: areaId } } : {}),
    pincodes: { $in: pins },
  }).session(session);
  if (clash) {
    const pin = pins.find((code) => clash.pincodes.includes(code));
    throw Error(`PIN code ${pin} is already in ${clash.name}. Each PIN code can belong to one area.`);
  }
}
export async function serviceAreaAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const operation = z.enum(["create", "update"]).catch("update").parse(form.get("operation"));
    const data = z
      .object({
        areaId: objectId.optional(),
        name: z.string().trim().min(2).max(60),
        pincodes: pincodeList,
        feePaise: z.coerce.number().int().min(0).max(100000),
        codLimitPaise: z.coerce.number().int().min(0).max(10000000),
        enabled: z.enum(["on"]).optional(),
        codEnabled: z.enum(["on"]).optional(),
      })
      .parse(formWithPaise(form));
    const after = {
      name: data.name,
      pincodes: [...new Set(data.pincodes.split(",").map((p) => p.trim()))],
      feePaise: data.feePaise,
      codLimitPaise: data.codLimitPaise,
      enabled: data.enabled === "on",
      codEnabled: data.codEnabled === "on",
    };
    let areaId = data.areaId ?? "";
    await mongoose.connection.transaction(async (session) => {
      if (operation === "create") {
        await assertPinsFree(after.pincodes, null, session);
        // a stable key from the name ("RIL Township" → "ril-township"); Marathi-only names get a random one
        const key =
          data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
          `area-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
        if (await ServiceArea.exists({ $or: [{ key }, { name: data.name }] }).session(session))
          throw Error("An area with this name already exists. Pick another name, or edit that area.");
        const [created] = await ServiceArea.create([{ key, ...after }], { session });
        areaId = String(created._id);
        await AuditLog.create(
          [{ actorId: user.id, action: "service-area.create", target: areaId, details: { after } }],
          { session },
        );
        return;
      }
      if (!areaId) throw Error("This area no longer exists.");
      const before = await ServiceArea.findById(areaId).session(session);
      if (!before) throw Error("This area no longer exists.");
      await assertPinsFree(after.pincodes, areaId, session);
      await ServiceArea.updateOne({ _id: areaId }, { $set: after }, { session, runValidators: true });
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: "service-area.update",
            target: areaId,
            details: {
              before: {
                name: before.name,
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
    // an area that is on needs delivery times, or checkout has nothing to offer there
    const { defaultsFor } = after.enabled ? await ensureSlots({ force: true }) : { defaultsFor: [] };
    const times = defaultsFor.includes(data.name)
      ? ` Delivery times ${DEFAULT_TIMES_LABEL} were added; change them under Delivery times.`
      : "";
    revalidatePath("/", "layout");
    return {
      success:
        (operation === "create"
          ? `${data.name} added${after.enabled ? " and switched on" : ". Switch it on when you are ready to deliver there"}.`
          : "Delivery area updated.") + times,
    };
  } catch (e) {
    return { error: safe(e) };
  }
}
const windowFields = {
  startMinutes: z.coerce.number().int().min(0).max(1440),
  endMinutes: z.coerce.number().int().min(0).max(1440),
};
function assertWindow(start: number, end: number) {
  if (end - start < 30) throw Error("The delivery window must end at least 30 minutes after it starts.");
}
/** A single extra delivery time on one date, on top of the weekly ones. */
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
        ...windowFields,
        capacity: z.coerce.number().int().min(1).max(10000),
      })
      .parse(Object.fromEntries(form));
    assertWindow(data.startMinutes, data.endMinutes);
    if (data.date < istDate(new Date())) throw Error("Choose today or a later date.");
    if (!(await ServiceArea.exists({ _id: data.areaId, enabled: true })))
      throw Error("Switch on this area before adding delivery times to it.");
    const slot = { ...data, label: windowLabel(data.startMinutes, data.endMinutes) };
    await mongoose.connection.transaction(async (session) => {
      if (await DeliverySlot.exists({ areaId: data.areaId, date: data.date, label: slot.label }).session(session))
        throw Error("That delivery time already exists on this day.");
      const [created] = await DeliverySlot.create([slot], { session });
      await AuditLog.create(
        [{ actorId: user.id, action: "delivery-slot.create", target: String(created._id), details: slot }],
        { session },
      );
    });
    revalidatePath("/super-admin");
    return { success: `Delivery time added: ${dayLabel(data.date)}, ${slot.label}.` };
  } catch (e) {
    return { error: safe(e) };
  }
}

/**
 * Future slots made from a weekly time that nobody has booked, so they can be taken away when
 * the weekly time is paused, removed or loses a day. Booked slots always stay.
 */
async function unbookedFutureSlots(patternId: unknown, session: mongoose.ClientSession) {
  const slots = await DeliverySlot.find({
    patternId,
    date: { $gte: istDate(new Date()) },
    reserved: 0,
  })
    .select("_id date")
    .session(session);
  const withOrders = new Set(
    (await Order.find({ slotId: { $in: slots.map((slot) => slot._id) } }).select("slotId").session(session)).map(
      (order) => String(order.slotId),
    ),
  );
  return slots.filter((slot) => !withOrders.has(String(slot._id)));
}

/** Weekly delivery times: add one, change its days or size, pause, resume or remove it. */
export async function slotPatternAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const operation = z
      .enum(["create", "update", "pause", "resume", "remove"])
      .parse(form.get("operation"));
    const days = [...new Set(form.getAll("days").map(Number))].filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    );
    let message = "";
    await mongoose.connection.transaction(async (session) => {
      if (operation === "create") {
        const data = z
          .object({
            areaId: objectId,
            ...windowFields,
            capacity: z.coerce.number().int().min(1).max(10000),
          })
          .parse(Object.fromEntries(form));
        assertWindow(data.startMinutes, data.endMinutes);
        if (!days.length) throw Error("Pick at least one day of the week.");
        const area = await ServiceArea.findOne({ _id: data.areaId }).session(session);
        if (!area) throw Error("This area no longer exists.");
        if (
          await SlotPattern.exists({
            areaId: data.areaId,
            startMinutes: data.startMinutes,
            endMinutes: data.endMinutes,
          }).session(session)
        )
          throw Error(
            `This area already has a weekly delivery time from ${windowLabel(data.startMinutes, data.endMinutes)}. Change that one instead.`,
          );
        const [pattern] = await SlotPattern.create([{ ...data, days }], { session });
        await AuditLog.create(
          [{ actorId: user.id, action: "slot-pattern.create", target: String(pattern._id), details: { ...data, days } }],
          { session },
        );
        message = `Weekly delivery time added for ${area.name}. Slots for the next two weeks are ready.`;
        return;
      }
      const patternId = objectId.parse(form.get("patternId"));
      const pattern = await SlotPattern.findById(patternId).session(session);
      if (!pattern) throw Error("This weekly delivery time no longer exists.");
      const before = pattern.toObject();
      if (operation === "update") {
        if (!days.length) throw Error("Pick at least one day of the week.");
        const capacity = z.coerce.number().int().min(1).max(10000).parse(form.get("capacity"));
        pattern.days = days;
        pattern.capacity = capacity;
        await pattern.save({ session });
        // days taken away: their unbooked slots go; the new size applies to slots not already fuller
        const dropped = (await unbookedFutureSlots(pattern._id, session)).filter(
          (slot) => !days.includes(new Date(`${slot.date}T00:00:00Z`).getUTCDay()),
        );
        await DeliverySlot.deleteMany({ _id: { $in: dropped.map((slot) => slot._id) } }).session(session);
        await DeliverySlot.updateMany(
          { patternId: pattern._id, date: { $gte: istDate(new Date()) }, reserved: { $lte: capacity } },
          { $set: { capacity } },
          { session },
        );
        message = "Weekly delivery time updated.";
      } else if (operation === "pause" || operation === "remove") {
        const unbooked = await unbookedFutureSlots(pattern._id, session);
        await DeliverySlot.deleteMany({ _id: { $in: unbooked.map((slot) => slot._id) } }).session(session);
        if (operation === "remove") await SlotPattern.deleteOne({ _id: pattern._id }).session(session);
        else {
          pattern.enabled = false;
          await pattern.save({ session });
        }
        message =
          operation === "remove"
            ? "Weekly delivery time removed. Slots people already booked stay."
            : "Weekly delivery time paused. Slots people already booked stay.";
      } else {
        pattern.enabled = true;
        await pattern.save({ session });
        message = "Weekly delivery time resumed.";
      }
      await AuditLog.create(
        [
          {
            actorId: user.id,
            action: `slot-pattern.${operation}`,
            target: patternId,
            details: { before, after: operation === "remove" ? null : pattern.toObject() },
          },
        ],
        { session },
      );
    });
    await ensureSlots({ force: true });
    revalidatePath("/super-admin");
    revalidatePath("/admin");
    return { success: message };
  } catch (e) {
    return { error: safe(e) };
  }
}

/** One slot on one day: close it, reopen it or change how many orders it takes. */
export async function slotAdjustAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const data = z
      .object({
        slotId: objectId,
        operation: z.enum(["close", "open", "capacity"]),
        capacity: z.coerce.number().int().min(1).max(10000).optional(),
      })
      .parse(Object.fromEntries(form));
    const slot = await DeliverySlot.findById(data.slotId);
    if (!slot) throw Error("This slot no longer exists.");
    const before = { enabled: slot.enabled, capacity: slot.capacity };
    if (data.operation === "capacity") {
      if (!data.capacity) throw Error("Orders it can take is required.");
      if (data.capacity < slot.reserved)
        throw Error(`Orders it can take must be at least ${slot.reserved}, the orders already booked.`);
      slot.capacity = data.capacity;
    } else {
      if (data.operation === "open" && slot.date < istDate(new Date()))
        throw Error("This slot is in the past and can't be reopened.");
      slot.enabled = data.operation === "open";
    }
    await slot.save();
    await AuditLog.create({
      actorId: user.id,
      action: `delivery-slot.${data.operation}`,
      target: data.slotId,
      details: { before, after: { enabled: slot.enabled, capacity: slot.capacity } },
    });
    revalidatePath("/super-admin");
    revalidatePath("/admin");
    return {
      success:
        data.operation === "close"
          ? "Slot closed. Orders already booked in it stay."
          : data.operation === "open"
            ? "Slot reopened."
            : "Slot size updated.",
    };
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

/** The shop's legal name, GSTIN and address, printed at the top of school quotations. */
export async function taxDetailsAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    await saveTaxProfile(user.id, Object.fromEntries(form));
    revalidatePath("/super-admin");
    revalidatePath("/p/contact-and-grievance");
    return { success: "Business and tax details saved. Quotations sent from now on and the Contact page use them." };
  } catch (e) {
    return { error: safe(e) };
  }
}
