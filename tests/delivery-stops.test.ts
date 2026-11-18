import { describe, expect, it } from "vitest";
import { windowStart } from "../src/lib/commerce/slots";
import { roundByDay } from "../src/lib/operations/stops";

describe("a rider's stops in the order the round runs", () => {
  it("reads when a delivery window opens", () => {
    expect(windowStart("10:00 AM – 1:00 PM")).toBe(600);
    expect(windowStart("4:00 PM – 7:00 PM")).toBe(960);
    expect(windowStart("12:30 PM – 2:00 PM")).toBe(750);
    expect(windowStart("10–12")).toBe(600);
    expect(windowStart("")).toBe(Infinity);
  });
  it("groups by day, earliest window first, the parcel on its way first within a window", () => {
    const stop = (n: string, deliveryDate: string, deliveryWindow: string, deliveryStatus = "assigned") => ({
      n, deliveryDate, deliveryWindow, deliveryStatus,
    });
    const days = roundByDay([
      stop("evening", "2026-11-17", "4:00 PM – 7:00 PM"),
      stop("tomorrow", "2026-11-18", "10:00 AM – 1:00 PM"),
      stop("morning", "2026-11-17", "10:00 AM – 1:00 PM"),
      stop("on its way", "2026-11-17", "10:00 AM – 1:00 PM", "out-for-delivery"),
      stop("missed", "2026-11-17", "10:00 AM – 1:00 PM", "attempted"),
    ]);
    expect(days.map((day) => [day.date, day.stops.map((s) => s.n)])).toEqual([
      ["2026-11-17", ["on its way", "missed", "morning", "evening"]],
      ["2026-11-18", ["tomorrow"]],
    ]);
  });
});
