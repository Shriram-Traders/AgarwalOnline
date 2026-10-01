import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { codeProblem, offerSaving, shopOffers } from "../src/lib/promotions/service";

const uri = process.env.TEST_MONGODB_URI;
const DAY = 24 * 60 * 60 * 1000;

describe("How an offer's saving reads", () => {
  it("names the cap on a percentage, and never a pointless one on a fixed amount", () => {
    expect(offerSaving({ discountType: "percentage", discountValue: 10 })).toBe("10% off");
    expect(offerSaving({ discountType: "percentage", discountValue: 10, maximumDiscountPaise: 10000 })).toBe(
      "10% off, up to ₹100",
    );
    expect(offerSaving({ discountType: "fixed", discountValue: 2500, maximumDiscountPaise: 2500 })).toBe("₹25 off");
    // a cap below the fixed amount is what the shopper really gets
    expect(offerSaving({ discountType: "fixed", discountValue: 5000, maximumDiscountPaise: 2000 })).toBe("₹20 off");
    expect(offerSaving({ discountType: "percentage", discountValue: 10, maximumDiscountPaise: 10000 }, "mr")).toBe(
      "10% सूट, ₹100 पर्यंत",
    );
  });
});

describe.skipIf(!uri)("The basket's list of shop offers", () => {
  let customer: string;
  let owner: mongoose.Types.ObjectId;
  const offer = (fields: Record<string, unknown>) =>
    Promotion.create({
      name: "Offer",
      kind: "code",
      discountType: "percentage",
      discountValue: 10,
      minimumSubtotalPaise: 0,
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + DAY),
      active: true,
      createdBy: owner,
      updatedBy: owner,
      ...fields,
    });
  const usedBy = (promotionId: unknown, customerId: string) =>
    PromotionRedemption.create({
      promotionId,
      customerId,
      orderId: new mongoose.Types.ObjectId(),
      discountPaise: 100,
    });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    await Promise.all([User, Promotion, PromotionRedemption].map((m) => m.init()));
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    const shopper = await User.create({ name: "Offer Shopper", phone: "9000000071", roles: ["customer"] });
    const boss = await User.create({
      name: "Offer Owner",
      phone: "9000000072",
      roles: ["customer", "super-admin"],
    });
    customer = String(shopper._id);
    owner = boss._id;
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("shows live coupon codes and automatic savings, and leaves out private, paused, ended and claimed ones", async () => {
    await offer({ name: "Listed", code: "LISTED10" });
    await offer({ name: "Private", code: "SECRET10", listed: false });
    await offer({ name: "Paused", code: "PAUSED10", active: false });
    await offer({ name: "Ended", code: "ENDED10", endsAt: new Date(Date.now() - 1000) });
    await offer({ name: "Claimed", code: "GONE10", globalLimit: 1, redemptionCount: 1 });
    await offer({
      name: "Automatic",
      kind: "automatic",
      discountType: "fixed",
      discountValue: 5000,
      minimumSubtotalPaise: 100000,
    });
    const offers = await shopOffers(60000, { customerId: customer });
    // usable first, then the ones the basket is too small for
    expect(offers.map((item) => item.name)).toEqual(["Listed", "Automatic"]);
    expect(offers[0]).toMatchObject({ code: "LISTED10", state: "ready", savePaise: 6000 });
    expect(offers[1]).toMatchObject({ code: undefined, state: "short", shortfallPaise: 40000, savePaise: 0 });
  });

  it("marks the offer on the basket and the ones this shopper has used up", async () => {
    const applied = await offer({ name: "Applied", code: "APPLY10" });
    const used = await offer({ name: "Used", code: "USED10" });
    const twice = await offer({ name: "Twice", code: "TWICE10", perCustomerLimit: 2 });
    await usedBy(used._id, customer);
    await usedBy(twice._id, customer);
    const offers = await shopOffers(60000, { customerId: customer, appliedId: String(applied._id) });
    expect(offers.map((item) => [item.name, item.state])).toEqual([
      ["Applied", "applied"],
      ["Twice", "ready"],
      ["Used", "used"],
    ]);
    // a guest hasn't used anything yet
    expect((await shopOffers(60000)).every((item) => item.state === "ready")).toBe(true);
  });

  it("explains in plain words why a typed code isn't on the basket", async () => {
    await offer({ name: "Big basket", code: "BIG50", minimumSubtotalPaise: 49900 });
    await offer({ name: "Paused", code: "PAUSED10", active: false });
    await offer({ name: "Later", code: "LATER10", startsAt: new Date(Date.now() + DAY) });
    await offer({ name: "Ended", code: "ENDED10", endsAt: new Date(Date.now() - 1000) });
    await offer({ name: "Claimed", code: "GONE10", globalLimit: 1, redemptionCount: 1 });
    const once = await offer({ name: "Once", code: "ONCE10" });
    await usedBy(once._id, customer);

    expect(await codeProblem("NOPE10", 60000, customer)).toMatch(/check the spelling/);
    expect(await codeProblem("big50", 40000, customer)).toBe(
      "This code is for baskets of ₹499 or more. Add ₹99 more to use it.",
    );
    expect(await codeProblem("BIG50", 49900, customer)).toBeNull();
    expect(await codeProblem("PAUSED10", 60000, customer)).toBe("This offer isn’t running right now.");
    expect(await codeProblem("LATER10", 60000, customer)).toBe("This offer isn’t running right now.");
    expect(await codeProblem("ENDED10", 60000, customer)).toBe("This offer has ended.");
    expect(await codeProblem("GONE10", 60000, customer)).toBe("This offer has been fully claimed.");
    expect(await codeProblem("ONCE10", 60000, customer)).toBe("You’ve already used this code.");
    // before signing in there is no history to check
    expect(await codeProblem("ONCE10", 60000)).toBeNull();
  });
});
