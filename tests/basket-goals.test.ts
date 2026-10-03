import { describe, expect, it } from "vitest";
import { basketGoals, type GoalOffer } from "../src/lib/commerce/goals";

const offer = (id: string, minimum: number, extra: Partial<GoalOffer> = {}): GoalOffer => ({
  id,
  saving: "10% off",
  code: id.toUpperCase(),
  name: id,
  minimumSubtotalPaise: minimum,
  state: "short",
  ...extra,
});

describe("The basket's goal bar", () => {
  it("points at free delivery when it comes first", () => {
    const goals = basketGoals(34000, 50000, [offer("local10", 99900)]);
    expect(goals.headline).toBe("Add ₹160 more for free delivery");
    expect(goals.milestones.map((m) => [m.key, m.reached])).toEqual([
      ["delivery", false],
      ["local10", false],
    ]);
    expect(goals.maxPaise).toBe(99900);
  });

  it("then points at the next offer, naming its saving and code", () => {
    const goals = basketGoals(84000, 50000, [offer("local10", 99900)]);
    expect(goals.headline).toBe("Add ₹159 more for 10% off (LOCAL10)");
    expect(goals.next?.key).toBe("local10");
    expect(goals.milestones[0].reached).toBe(true);
  });

  it("names an offer without a code by its name", () => {
    const goals = basketGoals(60000, 50000, [offer("everyday", 70000, { code: undefined, name: "Everyday basket saving", saving: "₹25 off" })]);
    expect(goals.headline).toBe("Add ₹100 more for ₹25 off (Everyday basket saving)");
  });

  it("celebrates once everything is unlocked", () => {
    expect(basketGoals(120000, 50000, [offer("local10", 99900, { state: "applied" })]).headline).toBe(
      "You’ve unlocked free delivery and every offer",
    );
    expect(basketGoals(60000, 50000, []).headline).toBe("You’ve unlocked free delivery");
    expect(basketGoals(60000, 0, [offer("x", 1000, { state: "ready" })]).headline).toBe("You’ve unlocked every offer");
  });

  it("leaves out used-up offers and offers with no minimum, and shows at most four goals", () => {
    const goals = basketGoals(1000, 50000, [
      offer("used", 60000, { state: "used" }),
      offer("anytime", 0, { state: "ready" }),
      offer("a", 70000),
      offer("b", 80000),
      offer("c", 90000),
      offer("d", 100000),
    ]);
    expect(goals.milestones.map((m) => m.key)).toEqual(["delivery", "a", "b", "c"]);
  });

  it("has nothing to show when there's no free delivery amount and no offers", () => {
    expect(basketGoals(1000, 0, [])).toMatchObject({ milestones: [], headline: "", maxPaise: 0 });
  });
});
