import type { ClientSession } from "mongoose";
import { User } from "../db/models";
import { Order } from "../commerce/models";
import { istDate } from "../commerce/delivery";
import { Refund } from "../payments/models";
import { formatPrice } from "../display";
import { Family, SPENT, TabPayment } from "./models";

const PICK = "Select who this order is for.";

/**
 * What an order carries into Family spend, decided inside the checkout transaction.
 * `private` keeps it out; empty means the whole family; otherwise an adult's or a child's id.
 * Only models are imported here, so the commerce service can call it without a cycle.
 */
export async function orderFamily(customerId: string, forId: string | undefined, session: ClientSession) {
  if (forId === "private") return {};
  const family = await Family.findOne({ adults: customerId }).session(session);
  if (!family) {
    if (forId) throw Error(PICK);
    return {};
  }
  if (!forId) return { familyId: family._id };
  const child = family.children.find((c: { _id: unknown }) => String(c._id) === forId);
  if (child) return { familyId: family._id, forPerson: { personId: child._id, name: child.name, child: true } };
  if (!family.adults.some((a: unknown) => String(a) === forId)) throw Error(PICK);
  const person = await User.findById(forId).select("name").session(session);
  const name = person?.name?.trim().split(/\s+/)[0] || "Someone";
  return { familyId: family._id, forPerson: { personId: person?._id ?? forId, name, child: false } };
}

/** IST midnight on the 1st of this month. */
function monthStart(now: Date) {
  const [year, month] = istDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1) - 330 * 60 * 1000);
}

/**
 * The tab, worked out afresh every time from the orders put on it, the refunds taken off it and
 * the payments made (voided ones ignored). `due` is what was charged before this month and is
 * still unpaid, with payments set against the oldest charges first; after the 10th it is overdue.
 */
export async function tabBalance(familyId: unknown, now = new Date(), session: ClientSession | null = null) {
  const orders = await Order.find({ familyId, paymentMethod: "tab", ...SPENT }).select("totalPaise createdAt").session(session);
  const [refunds, payments] = await Promise.all([
    orders.length
      ? Refund.find({ orderId: { $in: orders.map((o) => o._id) }, mode: "tab", status: "processed" })
          .select("orderId amountPaise")
          .session(session)
      : [],
    TabPayment.find({ familyId, voidedAt: null }).select("amountPaise").session(session),
  ]);
  const start = monthStart(now);
  let chargedPaise = 0;
  let chargedBeforePaise = 0;
  for (const order of orders) {
    const net =
      order.totalPaise -
      refunds.filter((r) => String(r.orderId) === String(order._id)).reduce((sum, r) => sum + r.amountPaise, 0);
    chargedPaise += net;
    if (order.createdAt < start) chargedBeforePaise += net;
  }
  const paidPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const duePaise = Math.max(0, chargedBeforePaise - paidPaise);
  return {
    chargedPaise,
    paidPaise,
    // below zero is credit on the tab, from a refund after it was paid
    owedPaise: chargedPaise - paidPaise,
    duePaise,
    overdue: Number(istDate(now).slice(8)) > 10 && duePaise > 0,
  };
}

/** Where this person's family tab stands, for checkout and the family page; null without one. */
export async function tabStanding(userId: string, now = new Date()) {
  const family = await Family.findOne({ adults: userId }).select("tab ownerId");
  if (!family?.tab?.status) return null;
  const balance = await tabBalance(family._id, now);
  const limitPaise: number = family.tab.limitPaise ?? 0;
  return {
    familyId: String(family._id),
    status: family.tab.status as "requested" | "active" | "paused" | "closed",
    limitPaise,
    ...balance,
    availablePaise: Math.max(0, limitPaise - balance.owedPaise),
  };
}

/**
 * Called inside the checkout transaction once the total is known. The first write claims the
 * family document, so two adults checking out at once are serialised and the second one sees
 * the first one's order when it re-reads the balance.
 */
export async function chargeTab(customerId: string, totalPaise: number, session: ClientSession) {
  const now = new Date();
  const family = await Family.findOneAndUpdate(
    { adults: customerId, "tab.status": "active" },
    { $set: { "tab.lastChargeAt": now } },
    { session, returnDocument: "after" },
  );
  if (!family) throw Error("Your family tab is not open.");
  const balance = await tabBalance(family._id, now, session);
  if (balance.overdue)
    throw Error(
      `Your family tab has ${formatPrice(balance.duePaise)} due from last month. Pay it at the store or to the rider to use the tab again.`,
    );
  const available = family.tab.limitPaise - balance.owedPaise;
  if (totalPaise > available)
    throw Error(`This order is over your family tab limit. ${formatPrice(Math.max(0, available))} is available.`);
  return family;
}
