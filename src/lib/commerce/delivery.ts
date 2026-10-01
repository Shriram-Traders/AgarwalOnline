import { z } from "zod";
export const rulesSchema = z.object({
  cutoffHour: z.number().int().min(0).max(23),
  freeThresholdPaise: z.number().int().min(0),
  blackoutDates: z.array(z.iso.date()),
  holidays: z.array(z.number().int().min(0).max(6)),
});
export type DeliveryRules = z.infer<typeof rulesSchema>;
export const defaultRules: DeliveryRules = {
  cutoffHour: 15,
  freeThresholdPaise: 50000,
  blackoutDates: [],
  holidays: [],
};
export function istDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Minutes after midnight, India time. */
export function minutesNow(now = new Date()) {
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  return hour * 60 + minute;
}
/**
 * A same-day window that ends within the hour can't be delivered in time any more, so it is
 * no longer offered. Slots without structured times (typed before these existed) stay bookable.
 */
export function stillBookable(
  slot: { date: string; endMinutes?: number | null },
  now = new Date(),
) {
  if (slot.date !== istDate(now) || slot.endMinutes == null) return true;
  return slot.endMinutes - minutesNow(now) >= 60;
}
export function earliestDelivery(now: Date, rules: DeliveryRules) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const date = new Date(`${istDate(now)}T00:00:00Z`);
  if (Number(parts) >= rules.cutoffHour) date.setUTCDate(date.getUTCDate() + 1);
  for (let i = 0; i < 60; i++) {
    const day = date.toISOString().slice(0, 10);
    if (
      !rules.blackoutDates.includes(day) &&
      !rules.holidays.includes(date.getUTCDay())
    )
      return day;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  throw Error("No delivery dates are available.");
}
export function deliveryFee(
  subtotal: number,
  areaFee: number,
  rules: DeliveryRules,
) {
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal < 0 ||
    !Number.isSafeInteger(areaFee) ||
    areaFee < 0
  )
    throw Error("Invalid money");
  return subtotal >= rules.freeThresholdPaise ? 0 : areaFee;
}
