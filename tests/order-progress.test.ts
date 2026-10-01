import { describe, it, expect } from "vitest";
import { cancellation, orderHistory, orderTracker } from "../src/lib/order-progress";

const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 10, minute));
const placed = { dimension: "order", previous: "draft", next: "placed", at: at(0) };

describe("The customer's order tracker", () => {
  it("marks the steps behind the order with their times, and the next one as current", () => {
    const steps = orderTracker(
      { orderStatus: "confirmed", fulfilmentStatus: "packed", deliveryStatus: "unassigned" },
      [placed, { dimension: "fulfilment", next: "picking", at: at(5) }, { dimension: "fulfilment", next: "packed", at: at(9) }],
    );
    expect(steps?.map((step) => [step.label, step.state])).toEqual([
      ["Order placed", "done"],
      ["Packed", "done"],
      ["On the way", "current"],
      ["Delivered", "todo"],
    ]);
    expect(steps?.[1].at).toEqual(at(9));
    expect(steps?.[2].at).toBeUndefined();
  });

  it("uses the latest start when a delivery was tried again, and shows every step once delivered", () => {
    const steps = orderTracker({ orderStatus: "completed", fulfilmentStatus: "ready", deliveryStatus: "delivered" }, [
      placed,
      { dimension: "fulfilment", next: "ready", at: at(10) },
      { dimension: "delivery", next: "out-for-delivery", at: at(20) },
      { dimension: "delivery", next: "attempted", at: at(30) },
      { dimension: "delivery", next: "out-for-delivery", at: at(40) },
      { dimension: "delivery", next: "delivered", at: at(50) },
    ]);
    expect(steps?.every((step) => step.state === "done")).toBe(true);
    expect(steps?.[2].at).toEqual(at(40));
    expect(steps?.[3].at).toEqual(at(50));
  });

  it("counts an order given to a rider as packed, as the order's status line does", () => {
    const steps = orderTracker({ orderStatus: "confirmed", fulfilmentStatus: "unassigned", deliveryStatus: "assigned" }, [placed]);
    expect(steps?.map((step) => step.state)).toEqual(["done", "done", "current", "todo"]);
  });

  it("falls back to the order's own time for an order with no history, and has no road for a cancelled one", () => {
    expect(orderTracker({ orderStatus: "placed" }, [], at(1))?.[0]).toMatchObject({ state: "done", at: at(1) });
    expect(orderTracker({ orderStatus: "cancelled" }, [placed])).toBeNull();
    expect(orderTracker({ orderStatus: "cancelled", deliveryStatus: "returned" }, [placed])).toBeNull();
  });
});

describe("The customer's order history", () => {
  it("reads in plain words, newest first, and leaves out the shop's own steps and notes", () => {
    const history = orderHistory([
      placed,
      { dimension: "order", next: "confirmed", at: at(2) },
      { dimension: "delivery", next: "assigned", notes: "Rider changed from A to B", at: at(3) },
      { dimension: "cod", next: "reconciled", at: at(4) },
      { dimension: "order", next: "cancelled", notes: "Out of stock on the whole list", at: at(5) },
    ]);
    expect(history.map((entry) => entry.label)).toEqual([
      "Order cancelled",
      "Delivery partner assigned",
      "Confirmed by the shop",
      "Order placed",
    ]);
    // only the store's cancellation reason is written for the customer
    expect(history[0].note).toBe("Out of stock on the whole list");
    expect(history[1].note).toBeUndefined();
  });

  it("says who cancelled", () => {
    const customer = "66f0c0ffee00000000000001";
    expect(cancellation([placed, { dimension: "order", next: "cancelled", actorId: customer, at: at(5) }], customer)).toEqual({
      at: at(5),
      byCustomer: true,
      reason: undefined,
    });
    expect(
      cancellation([{ dimension: "order", next: "cancelled", actorId: "someone-else", notes: "Shop closed", at: at(6) }], customer),
    ).toMatchObject({ byCustomer: false, reason: "Shop closed" });
    expect(cancellation([placed], customer)).toBeNull();
  });
});
