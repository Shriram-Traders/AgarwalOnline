import { connectDB } from "../db/connect";
import { AuditLog, ServiceArea } from "../db/models";
import { DeliverySlot, SlotPattern } from "./models";
import { earliestDelivery, istDate, stillBookable } from "./delivery";
import { deliveryRules } from "./service";

/** How far ahead weekly delivery times are turned into bookable slots. */
export const DAYS_AHEAD = 14;

/** 6:00 AM to 10:00 PM in half hours: the times the owner picks from. */
export const TIME_CHOICES = Array.from({ length: 33 }, (_, i) => 6 * 60 + i * 30);

export function clock(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
/** "4:00 PM – 7:00 PM", the same form the seeded and hand-typed slots use. */
export const windowLabel = (start: number, end: number) => `${clock(start)} – ${clock(end)}`;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon–Sat", "Mon, Wed, Fri", "Every day". */
export function daysLabel(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  // a run of 3+ consecutive days reads as a range
  const consecutive = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);
  if (consecutive && sorted.length >= 3) return `${WEEKDAYS[sorted[0]]}–${WEEKDAYS[sorted.at(-1)!]}`;
  return sorted.map((day) => WEEKDAYS[day]).join(", ");
}

/** "Today", "Tomorrow" or "Wed 1 Oct", for a YYYY-MM-DD delivery date, in India time. */
export function dayLabel(date: string, now = new Date()) {
  const today = istDate(now);
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === today) return "Today";
  if (date === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export { minutesNow, stillBookable } from "./delivery";

/**
 * The delivery times a switched-on area gets when the owner hasn't set any: Mon–Sat, a morning
 * and an evening window, 20 orders each. Without them an area was "on" but checkout had nothing
 * to offer ("No available slots"). The owner changes them under Store settings → Delivery times.
 */
export const DEFAULT_TIMES = [
  { startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { startMinutes: 16 * 60, endMinutes: 19 * 60 },
];
export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];
export const DEFAULT_CAPACITY = 20;
/** "Mon–Sat, 10:00 AM – 1:00 PM and 4:00 PM – 7:00 PM", for telling the owner what was added. */
export const DEFAULT_TIMES_LABEL = `${daysLabel(DEFAULT_DAYS)}, ${DEFAULT_TIMES.map((time) =>
  windowLabel(time.startMinutes, time.endMinutes),
).join(" and ")}`;

/**
 * Gives every switched-on area that has neither weekly delivery times nor any upcoming slot the
 * default times. An area the owner runs on one-off slots only (it has upcoming slots) is left alone.
 * Returns the names of the areas that got them.
 */
async function ensureDefaultTimes(now: Date) {
  const areas = await ServiceArea.find({ enabled: true }).select("name");
  if (!areas.length) return [];
  const [withPatterns, withSlots] = await Promise.all([
    SlotPattern.distinct("areaId", { areaId: { $in: areas.map((area) => area._id) } }),
    DeliverySlot.distinct("areaId", {
      areaId: { $in: areas.map((area) => area._id) },
      date: { $gte: istDate(now) },
    }),
  ]);
  const covered = new Set([...withPatterns, ...withSlots].map(String));
  const bare = areas.filter((area) => !covered.has(String(area._id)));
  const added: string[] = [];
  for (const area of bare) {
    const created = await SlotPattern.insertMany(
      DEFAULT_TIMES.map((time) => ({
        areaId: area._id,
        days: DEFAULT_DAYS,
        ...time,
        capacity: DEFAULT_CAPACITY,
      })),
      { ordered: false },
    ).catch((error: { code?: number; writeErrors?: { code?: number }[] }) => {
      // another request added them a moment earlier
      const duplicates = error.code === 11000 || error.writeErrors?.every((item) => item.code === 11000);
      if (!duplicates) throw error;
      return [];
    });
    if (!created.length) continue;
    added.push(area.name as string);
    await AuditLog.create({
      action: "slot-pattern.default",
      target: String(area._id),
      details: { area: area.name, days: DEFAULT_DAYS, times: DEFAULT_TIMES, capacity: DEFAULT_CAPACITY },
    });
  }
  return added;
}

let lastRun = 0;
/**
 * Turns the weekly delivery times into slots for the next two weeks, skipping closed days.
 * Existing slots are left alone (bookings and any capacity the owner changed by hand stay).
 * A switched-on area with no delivery times at all first gets the default ones.
 * Runs at most every ten minutes per server unless forced, so pages can call it freely.
 * Returns the areas that were given default times on this run.
 */
export async function ensureSlots({ force = false, now = new Date() } = {}) {
  if (!force && Date.now() - lastRun < 10 * 60 * 1000) return { defaultsFor: [] as string[] };
  lastRun = Date.now();
  await connectDB();
  const defaultsFor = await ensureDefaultTimes(now);
  const patterns = await SlotPattern.find({ enabled: true });
  if (!patterns.length) return { defaultsFor };
  const rules = await deliveryRules();
  const start = new Date(`${istDate(now)}T00:00:00Z`);
  const operations = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const day = new Date(start.getTime() + offset * 86400000);
    const date = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    if (rules.blackoutDates.includes(date) || rules.holidays.includes(weekday)) continue;
    for (const pattern of patterns) {
      if (!pattern.days.includes(weekday)) continue;
      operations.push({
        updateOne: {
          filter: {
            areaId: pattern.areaId,
            date,
            label: windowLabel(pattern.startMinutes, pattern.endMinutes),
          },
          update: {
            $setOnInsert: {
              startMinutes: pattern.startMinutes,
              endMinutes: pattern.endMinutes,
              patternId: pattern._id,
              capacity: pattern.capacity,
              reserved: 0,
              enabled: true,
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (!operations.length) return { defaultsFor };
  // throwOnValidationError: otherwise Mongoose skips slots it can't cast without a word (seen when a
  // long-running dev server still held the slot model from before startMinutes/endMinutes existed)
  await DeliverySlot.bulkWrite(operations, { ordered: false, throwOnValidationError: true }).catch((error: { code?: number; writeErrors?: { code?: number }[] }) => {
    // two servers creating the same slot at once: the other one won, which is fine
    const duplicates = error.code === 11000 || error.writeErrors?.every((item) => item.code === 11000);
    if (!duplicates) throw error;
  });
  return { defaultsFor };
}

/**
 * Switched-on areas with nothing bookable over the next two delivery days: shoppers there can't
 * get a delivery soon (or at all). Shown to staff so a missing slot is noticed before customers
 * find it.
 */
export async function slotGaps(now = new Date()) {
  await connectDB();
  const [areas, rules] = await Promise.all([
    ServiceArea.find({ enabled: true }).select("name"),
    deliveryRules(),
  ]);
  if (!areas.length) return { date: null as string | null, areas: [] as string[] };
  let date: string;
  try {
    date = earliestDelivery(now, rules);
  } catch {
    return { date: null, areas: areas.map((area) => area.name as string) };
  }
  // the next delivery day and the one after it that the store is open
  const following = new Date(`${date}T00:00:00Z`);
  for (let step = 0; step < 60; step++) {
    following.setUTCDate(following.getUTCDate() + 1);
    const closed =
      rules.holidays.includes(following.getUTCDay()) ||
      rules.blackoutDates.includes(following.toISOString().slice(0, 10));
    if (!closed) break;
  }
  const slots = await DeliverySlot.find({
    date: { $gte: date, $lte: following.toISOString().slice(0, 10) },
    enabled: true,
    areaId: { $in: areas.map((area) => area._id) },
    $expr: { $lt: ["$reserved", "$capacity"] },
  }).select("areaId date endMinutes");
  const open = new Set(
    slots.filter((slot) => stillBookable(slot, now)).map((slot) => String(slot.areaId)),
  );
  return {
    date,
    areas: areas.filter((area) => !open.has(String(area._id))).map((area) => area.name as string),
  };
}
