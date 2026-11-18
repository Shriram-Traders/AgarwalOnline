import mongoose from "mongoose";
import { z } from "zod";
import { AuditLog } from "../db/models";
import { Order, OrderTimelineEvent } from "../commerce/models";
import { objectId } from "../commerce/service";
import { formatPrice } from "../display";
import { CODCollection, CashHandover } from "./models";
import { actor } from "./service";

/**
 * The rider says they're handing over the cash they hold: every collection not yet handed over or
 * settled goes into one handover, which waits for the shop to count it and confirm.
 */
export async function startHandover(riderId: string) {
  await actor(riderId, "cod:collect");
  return mongoose.connection.transaction(async (session) => {
    const holding = await CODCollection.find({ collectorId: riderId, reconciledAt: null, handoverId: null }).session(session);
    if (!holding.length) throw Error("There is no cash with you to hand over.");
    const amountPaise = holding.reduce((sum, c) => sum + (c.collectedPaise as number), 0);
    const [handover] = await CashHandover.create([{ riderId, collectionIds: holding.map((c) => c._id), amountPaise }], {
      session,
    });
    const claimed = await CODCollection.updateMany(
      { _id: { $in: holding.map((c) => c._id) }, handoverId: null, reconciledAt: null },
      { $set: { handoverId: handover._id } },
      { session },
    );
    if (claimed.modifiedCount !== holding.length) throw Error("This cash has just changed. Refresh and try again.");
    return `Handover of ${formatPrice(amountPaise)} started: the shop confirms it once they have counted it.`;
  });
}

/**
 * The shop has counted the cash and it is all there: each order in the handover is settled at once,
 * as if handed over order by order. A shortfall is settled order by order on the order page instead.
 */
export async function confirmHandover(actorId: string, input: unknown) {
  await actor(actorId, "cod:reconcile");
  const { handoverId } = z.object({ handoverId: objectId }).parse(input);
  return mongoose.connection.transaction(async (session) => {
    const handover = await CashHandover.findOne({ _id: handoverId, confirmedAt: null }).session(session);
    if (!handover) throw Error("This handover is already confirmed or unavailable.");
    const now = new Date();
    // settled one by one on an order page in the meantime: those stay as they are
    const open = await CODCollection.find({ _id: { $in: handover.collectionIds }, reconciledAt: null }).session(session);
    for (const collection of open) {
      collection.set({
        receivedPaise: collection.collectedPaise,
        discrepancyPaise: 0,
        reconciliationNote: "Handed over by the rider",
        reconciledBy: actorId,
        reconciledAt: now,
      });
      await collection.save({ session });
      await Order.updateOne({ _id: collection.orderId, codStatus: "collected" }, { $set: { codStatus: "reconciled" } }, { session });
      await OrderTimelineEvent.create(
        [{ orderId: collection.orderId, actorId, dimension: "cod", previous: "collected", next: "reconciled", notes: "Handed over by the rider" }],
        { session },
      );
    }
    handover.set({ confirmedBy: actorId, confirmedAt: now });
    await handover.save({ session });
    const received = open.reduce((sum, c) => sum + (c.collectedPaise as number), 0);
    await AuditLog.create(
      [{ actorId, action: "cod.handover.confirm", target: String(handover._id), details: { receivedPaise: received, orders: open.length } }],
      { session },
    );
    return `Received ${formatPrice(received)}: ${open.length} ${open.length === 1 ? "order" : "orders"} settled.`;
  });
}
