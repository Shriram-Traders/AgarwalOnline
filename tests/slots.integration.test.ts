import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { ServiceArea } from "../src/lib/db/models";
import { DeliverySlot, SlotPattern, SystemSetting } from "../src/lib/commerce/models";
import { daysLabel, ensureSlots, slotGaps, windowLabel } from "../src/lib/commerce/slots";
import { istDate, stillBookable } from "../src/lib/commerce/delivery";

const uri = process.env.TEST_MONGODB_URI;
// Thursday 1 October 2026, 9:00 AM in India
const now = new Date("2026-10-01T03:30:00Z");

describe("Delivery time helpers", () => {
  it("writes windows and days the way the owner reads them", () => {
    expect(windowLabel(16 * 60, 19 * 60)).toBe("4:00 PM – 7:00 PM");
    expect(windowLabel(9 * 60 + 30, 12 * 60)).toBe("9:30 AM – 12:00 PM");
    expect(daysLabel([1, 2, 3, 4, 5, 6])).toBe("Mon–Sat");
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(daysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
  });
  it("stops offering a same-day window that ends within the hour", () => {
    const today = istDate(now);
    expect(stillBookable({ date: today, endMinutes: 12 * 60 }, now)).toBe(true);
    expect(stillBookable({ date: today, endMinutes: 9 * 60 + 30 }, now)).toBe(false);
    expect(stillBookable({ date: today }, now)).toBe(true);
    expect(stillBookable({ date: "2026-10-02", endMinutes: 9 * 60 }, now)).toBe(true);
  });
});

describe.skipIf(!uri)("Weekly delivery times", () => {
  let areaId: mongoose.Types.ObjectId;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const model of [ServiceArea, DeliverySlot, SlotPattern, SystemSetting]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    areaId = (
      await ServiceArea.create({ key: "town", name: "Town", pincodes: ["402106"], enabled: true })
    )._id;
    // closed on Sundays and on 3 October
    await SystemSetting.create({
      key: "delivery",
      value: { cutoffHour: 15, freeThresholdPaise: 50000, blackoutDates: ["2026-10-03"], holidays: [0] },
    });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("makes two weeks of slots from a weekly time, skipping closed days, and never twice", async () => {
    await SlotPattern.create({ areaId, days: [1, 2, 3, 4, 5, 6], startMinutes: 16 * 60, endMinutes: 19 * 60, capacity: 12 });
    await ensureSlots({ force: true, now });
    const slots = await DeliverySlot.find({}).sort({ date: 1 });
    const dates = slots.map((slot) => slot.date);
    expect(dates[0]).toBe("2026-10-01");
    expect(dates).not.toContain("2026-10-03"); // closed date
    expect(dates).not.toContain("2026-10-04"); // Sunday
    expect(dates.length).toBe(11); // 14 days less 2 Sundays and 1 closed date
    expect(slots[0].label).toBe("4:00 PM – 7:00 PM");
    expect(slots[0].capacity).toBe(12);
    // a slot the owner resized keeps its size; running again adds nothing
    await DeliverySlot.updateOne({ _id: slots[0]._id }, { capacity: 3 });
    await ensureSlots({ force: true, now });
    expect(await DeliverySlot.countDocuments()).toBe(11);
    expect((await DeliverySlot.findById(slots[0]._id))?.capacity).toBe(3);
  });

  it("gives a switched-on area with no delivery times the default ones, once", async () => {
    const first = await ensureSlots({ force: true, now });
    expect(first.defaultsFor).toEqual(["Town"]);
    const patterns = await SlotPattern.find({ areaId }).sort({ startMinutes: 1 });
    expect(patterns.map((pattern) => windowLabel(pattern.startMinutes, pattern.endMinutes))).toEqual([
      "10:00 AM – 1:00 PM",
      "4:00 PM – 7:00 PM",
    ]);
    expect(patterns[0].days).toEqual([1, 2, 3, 4, 5, 6]);
    // 11 open days in the next two weeks (no Sundays, not 3 October), two windows each
    expect(await DeliverySlot.countDocuments({ areaId })).toBe(22);
    expect((await ensureSlots({ force: true, now })).defaultsFor).toEqual([]);
    expect(await SlotPattern.countDocuments({ areaId })).toBe(2);
    expect((await slotGaps(now)).areas).toEqual([]);
  });

  it("leaves areas that are off, or run on one-off slots, without default times", async () => {
    await ServiceArea.updateOne({ _id: areaId }, { enabled: false });
    const oneOff = await ServiceArea.create({ key: "village", name: "Village", pincodes: ["402107"], enabled: true });
    await DeliverySlot.create({ areaId: oneOff._id, date: "2026-10-02", label: "9:00 AM – 11:00 AM", capacity: 5 });
    expect((await ensureSlots({ force: true, now })).defaultsFor).toEqual([]);
    expect(await SlotPattern.countDocuments()).toBe(0);
  });

  it("warns about a switched-on area with nothing to book, and stops once slots exist", async () => {
    expect((await slotGaps(now)).areas).toEqual(["Town"]);
    await SlotPattern.create({ areaId, days: [3, 4], startMinutes: 16 * 60, endMinutes: 19 * 60, capacity: 5 });
    await ensureSlots({ force: true, now });
    expect((await slotGaps(now)).areas).toEqual([]);
    // full slots don't count as bookable
    await DeliverySlot.updateMany({}, { $set: { reserved: 5 } });
    expect((await slotGaps(now)).areas).toEqual(["Town"]);
  });
});
