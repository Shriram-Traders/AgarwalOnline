import { windowStart } from "../commerce/slots";

/** Within one window: the parcel already on its way, then a missed one to try again, then the rest. */
const NEXT_UP: Record<string, number> = { "out-for-delivery": 0, attempted: 1, assigned: 2 };

type Stop = { deliveryDate?: string; deliveryWindow?: string; deliveryStatus: string };

/** A rider's stops the way the round runs: day by day, earliest window first. */
export function roundByDay<T extends Stop>(stops: T[]) {
  const sorted = [...stops].sort(
    (a, b) =>
      (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? "") ||
      windowStart(a.deliveryWindow) - windowStart(b.deliveryWindow) ||
      (NEXT_UP[a.deliveryStatus] ?? 9) - (NEXT_UP[b.deliveryStatus] ?? 9),
  );
  const days: { date: string; stops: T[] }[] = [];
  for (const stop of sorted) {
    const date = stop.deliveryDate ?? "";
    const day = days.at(-1);
    if (day?.date === date) day.stops.push(stop);
    else days.push({ date, stops: [stop] });
  }
  return days;
}
