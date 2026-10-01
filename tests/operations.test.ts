import { it, expect } from "vitest";
import {
  assertTransition,
  awaitingDecision,
  cancellable,
  paidOnline,
  riderChangeable,
} from "../src/lib/operations/transitions";
it("rejects skipped packing steps and reversed delivery states", () => {
  expect(() => assertTransition("fulfilment", "unassigned", "ready")).toThrow();
  expect(() =>
    assertTransition("delivery", "delivered", "out-for-delivery"),
  ).toThrow();
  expect(() => assertTransition("order", "cancelled", "confirmed")).toThrow();
  expect(() =>
    assertTransition("fulfilment", "picking", "packed"),
  ).not.toThrow();
});
it("lets the store cancel, retry, take back and reassign, but never pulls an order off the road", () => {
  for (const [dimension, from, to] of [
    ["order", "confirmed", "cancelled"],
    ["delivery", "assigned", "unassigned"],
    ["delivery", "attempted", "unassigned"],
    ["delivery", "attempted", "assigned"],
    ["delivery", "attempted", "returned"],
    ["delivery", "failed", "unassigned"],
    ["delivery", "failed", "returned"],
  ] as const)
    expect(() => assertTransition(dimension, from, to)).not.toThrow();
  for (const [dimension, from, to] of [
    ["order", "completed", "cancelled"],
    ["delivery", "out-for-delivery", "unassigned"],
    ["delivery", "out-for-delivery", "returned"],
    ["delivery", "delivered", "unassigned"],
    ["delivery", "failed", "assigned"],
    ["delivery", "returned", "unassigned"],
  ] as const)
    expect(() => assertTransition(dimension, from, to)).toThrow();
});
it("says which store decisions an order allows right now", () => {
  const order = (state: Partial<Record<string, string>> = {}) => ({
    orderStatus: "confirmed",
    deliveryStatus: "unassigned",
    paymentMethod: "cod",
    paymentStatus: "pending",
    ...state,
  });
  expect(cancellable(order({ orderStatus: "placed" }))).toBe(true);
  expect(cancellable(order({ deliveryStatus: "assigned" }))).toBe(true);
  expect(cancellable(order({ deliveryStatus: "out-for-delivery" }))).toBe(false);
  expect(cancellable(order({ orderStatus: "cancelled" }))).toBe(false);
  expect(awaitingDecision(order({ deliveryStatus: "failed" }))).toBe(true);
  expect(awaitingDecision(order({ deliveryStatus: "attempted" }))).toBe(true);
  expect(awaitingDecision(order({ orderStatus: "cancelled", deliveryStatus: "returned" }))).toBe(false);
  expect(riderChangeable(order({ deliveryStatus: "assigned" }))).toBe(true);
  expect(riderChangeable(order({ deliveryStatus: "attempted" }))).toBe(true);
  expect(riderChangeable(order({ deliveryStatus: "out-for-delivery" }))).toBe(false);
  expect(riderChangeable(order({ deliveryStatus: "failed" }))).toBe(false);
  // money still held from an online payment is only ever returned from the Refunds page
  expect(paidOnline(order({ paymentMethod: "razorpay", paymentStatus: "paid" }))).toBe(true);
  expect(paidOnline(order({ paymentMethod: "razorpay", paymentStatus: "partially-refunded" }))).toBe(true);
  expect(paidOnline(order({ paymentMethod: "razorpay", paymentStatus: "pending" }))).toBe(false);
  expect(paidOnline(order({ paymentMethod: "razorpay", paymentStatus: "refunded" }))).toBe(false);
  expect(paidOnline(order({ paymentStatus: "paid" }))).toBe(false);
});
