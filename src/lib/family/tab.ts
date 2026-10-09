import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog } from "../db/models";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { istDate } from "../commerce/delivery";
import { actor } from "../operations/service";
import { notify } from "../engagement/service";
import { formatPrice } from "../display";
import { tabBalance } from "./checkout";
import { Family, SPENT, TabPayment } from "./models";

type Status = "requested" | "active" | "paused" | "closed";
const MAX_LIMIT_PAISE = 10_000_000; // ₹1,00,000

async function tellAdults(adults: unknown[], title: string, body: string, session?: mongoose.ClientSession) {
  for (const userId of adults) await notify({ userId, type: "family", title, body, href: "/account/family#tab" }, session);
}

/** The family's owner asks the store for a tab; the store decides and sets the limit. */
export async function requestTab(ownerId: string) {
  await connectDB();
  const result = await Family.updateOne(
    { ownerId, adults: ownerId, $or: [{ "tab.status": { $exists: false } }, { "tab.status": "closed" }] },
    { $set: { "tab.status": "requested", "tab.requestedAt": new Date() } },
  );
  if (!result.matchedCount) throw Error("Only the family’s owner can ask, and only when there is no open tab.");
  const family = await Family.findOne({ ownerId }).select("_id");
  await AuditLog.create({ actorId: ownerId, action: "tab.request", target: String(family?._id) });
}

const decisions: Record<string, { from: Status[]; to?: Status; limit?: boolean }> = {
  approve: { from: ["requested"], to: "active", limit: true },
  limit: { from: ["active", "paused"], limit: true },
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  close: { from: ["requested", "active", "paused"], to: "closed" },
};

/**
 * The owner's decisions on a tab. Each is one conditional write from the states it is allowed
 * from, audited with the old and new limit, and the family's adults are told in the same step.
 */
export async function decideTab(actorId: string, input: unknown) {
  const data = z
    .object({
      familyId: objectId,
      decision: z.enum(["approve", "limit", "pause", "resume", "close"]),
      limitPaise: z.coerce.number().int().min(100, "Set a limit of at least ₹1.").max(MAX_LIMIT_PAISE, "Keep the limit at ₹1,00,000 or less.").optional(),
    })
    .parse(input);
  await actor(actorId, "tab:approve");
  const rule = decisions[data.decision];
  if (rule.limit && data.limitPaise === undefined) throw Error("Set the tab limit in rupees.");
  await mongoose.connection.transaction(async (session) => {
    const before = await Family.findOneAndUpdate(
      { _id: data.familyId, "tab.status": { $in: rule.from } },
      {
        $set: {
          ...(rule.to ? { "tab.status": rule.to } : {}),
          ...(rule.limit ? { "tab.limitPaise": data.limitPaise } : {}),
          "tab.decidedAt": new Date(),
          "tab.decidedBy": actorId,
        },
      },
      { session, returnDocument: "before", runValidators: true },
    );
    if (!before) throw Error("This tab has already changed. Refresh and try again.");
    await AuditLog.create(
      [
        {
          actorId,
          action: `tab.${data.decision}`,
          target: data.familyId,
          details: { from: before.tab.status, fromLimitPaise: before.tab.limitPaise, limitPaise: data.limitPaise },
        },
      ],
      { session },
    );
    const limit = formatPrice(data.limitPaise ?? before.tab.limitPaise ?? 0);
    const words: Record<string, [string, string]> = {
      approve: ["Your family tab is open", `Put orders on the tab up to ${limit}, and settle up once a month.`],
      limit: ["Your family tab limit changed", `The limit is now ${limit}.`],
      pause: ["Your family tab is paused", "New orders can’t go on the tab for now. Talk to the store to reopen it."],
      resume: ["Your family tab is open again", `Orders can go on the tab again, up to ${limit}.`],
      close: ["Your family tab is closed", "New orders can’t go on it. Anything still owed can be paid at the store."],
    };
    await tellAdults(before.adults, ...words[data.decision], session);
  });
}

/**
 * Money received for a tab. The key makes a double-tapped form record once; the family document
 * is claimed first so the "not more than owed" check can't race another payment or a checkout.
 */
export async function recordTabPayment(actorId: string, input: unknown) {
  const data = z
    .object({
      familyId: objectId,
      amountPaise: z.coerce.number().int().min(1, "Enter the amount received."),
      method: z.enum(["cash", "upi"], { error: "Pick cash or UPI." }),
      reference: z.string().trim().max(80).default(""),
      idempotencyKey: z.string().uuid(),
    })
    .parse(input);
  if (data.method === "upi" && data.reference.length < 4) throw Error("Enter the UPI reference number.");
  await actor(actorId, "cod:reconcile");
  let remaining = 0;
  await mongoose.connection.transaction(async (session) => {
    if (await TabPayment.exists({ idempotencyKey: data.idempotencyKey }).session(session)) return;
    const family = await Family.findOneAndUpdate(
      { _id: data.familyId, "tab.status": { $exists: true } },
      { $set: { "tab.lastPaymentAt": new Date() } },
      { session, returnDocument: "after" },
    );
    if (!family) throw Error("This family has no tab.");
    const balance = await tabBalance(family._id, new Date(), session);
    if (data.amountPaise > balance.owedPaise)
      throw Error(`That is more than the family owes (${formatPrice(Math.max(0, balance.owedPaise))}).`);
    const [payment] = await TabPayment.create([{ ...data, recordedBy: actorId }], { session });
    await AuditLog.create(
      [{ actorId, action: "tab.payment", target: data.familyId, details: { paymentId: String(payment._id), amountPaise: data.amountPaise, method: data.method } }],
      { session },
    );
    remaining = balance.owedPaise - data.amountPaise;
    await tellAdults(
      family.adults,
      `${formatPrice(data.amountPaise)} received for the family tab`,
      remaining > 0 ? `${formatPrice(remaining)} is still owed.` : "Nothing is owed now. Thank you.",
      session,
    );
  });
  return remaining;
}

/** A payment recorded by mistake is voided with a reason, never deleted, and the family is told. */
export async function voidTabPayment(actorId: string, input: unknown) {
  const data = z
    .object({ paymentId: objectId, reason: z.string().trim().min(3, "Say why it is being voided.").max(200) })
    .parse(input);
  await actor(actorId, "tab:approve");
  await mongoose.connection.transaction(async (session) => {
    const payment = await TabPayment.findOneAndUpdate(
      { _id: data.paymentId, voidedAt: null },
      { $set: { voidedAt: new Date(), voidedBy: actorId, voidReason: data.reason } },
      { session, returnDocument: "after" },
    );
    if (!payment) throw Error("This payment was already voided.");
    const family = await Family.findOneAndUpdate(
      { _id: payment.familyId },
      { $set: { "tab.lastPaymentAt": new Date() } },
      { session, returnDocument: "after" },
    );
    await AuditLog.create(
      [{ actorId, action: "tab.payment.void", target: String(payment.familyId), details: { paymentId: data.paymentId, reason: data.reason } }],
      { session },
    );
    await tellAdults(
      family?.adults ?? [],
      `A ${formatPrice(payment.amountPaise)} tab payment was cancelled`,
      `The store corrected it: ${data.reason}`,
      session,
    );
  });
}

/**
 * On the 1st (IST), each family with a tab is told what went on it last month and what it owes.
 * The month is claimed before anyone is told, so running this twice sends nothing twice.
 */
export async function sendTabStatements(now = new Date()) {
  await connectDB();
  const [year, month] = istDate(now).split("-").map(Number);
  const last = new Date(Date.UTC(year, month - 2, 1));
  const lastMonth = last.toISOString().slice(0, 7);
  const from = new Date(last.getTime() - 330 * 60 * 1000);
  const to = new Date(Date.UTC(year, month - 1, 1) - 330 * 60 * 1000);
  const monthName = last.toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  const dueBy = new Date(Date.UTC(year, month - 1, 10)).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" });
  const families = await Family.find({ "tab.status": { $exists: true }, "tab.statementMonth": { $ne: lastMonth } }).select("adults tab");
  let sent = 0;
  for (const family of families) {
    const [balance, orders] = await Promise.all([
      tabBalance(family._id, now),
      Order.find({ familyId: family._id, paymentMethod: "tab", ...SPENT, createdAt: { $gte: from, $lt: to } }).select("totalPaise"),
    ]);
    const added = orders.reduce((sum, o) => sum + o.totalPaise, 0);
    if (!added && balance.owedPaise <= 0) continue;
    let told = false;
    await mongoose.connection.transaction(async (session) => {
      // the driver may retry this callback; count only the attempt that commits
      told = false;
      const claimed = await Family.updateOne(
        { _id: family._id, "tab.statementMonth": { $ne: lastMonth } },
        { $set: { "tab.statementMonth": lastMonth } },
        { session },
      );
      if (!claimed.modifiedCount) return;
      await tellAdults(
        family.adults,
        `Your ${monthName} tab: ${formatPrice(added)} added`,
        balance.owedPaise > 0
          ? `${formatPrice(balance.owedPaise)} owed in all. Please pay by ${dueBy} at the store or to the rider.`
          : "Nothing is owed now. Thank you.",
        session,
      );
      told = true;
    });
    if (told) sent++;
  }
  return sent;
}
