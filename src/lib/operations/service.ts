import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { User, OTPChallenge, InventoryItem, AuditLog } from "../db/models";
import {
  Order,
  OrderTimelineEvent,
  InventoryReservation,
  InventoryMovement,
  DeliverySlot,
} from "../commerce/models";
import { objectId } from "../commerce/service";
import {
  assertPermission,
  hasPermission,
  roles,
  type Permission,
  type Role,
} from "../auth/permissions";
import { PackingChecklist, CODCollection, DeliveryAttempt } from "./models";
import {
  assertTransition,
  awaitingDecision,
  cancellable,
  paidOnline,
  riderChangeable,
  type Dimension,
} from "./transitions";
import { digest, otpCode, otpDigest, equalHash } from "../auth/crypto";
import { getEnv } from "../env";
import { rateLimit } from "../auth/rate-limit";
import { notify } from "../engagement/service";
import { returnOffer } from "../promotions/service";
import { Promotion } from "../promotions/models";
import {
  billFollowsPacking,
  billForPacking,
  decideLine,
  followsDecision,
  lineName,
  NONE_LEFT,
  packedOf,
  packingMessage,
  refundOwedNotice,
  reviewChecklist,
  waitingLabel,
  type ChecklistEntry,
  type LineDecision,
  type OfferTerms,
  type PackedLine,
} from "./packing";
type OrderDoc = InstanceType<typeof Order>;
type OrderLine = PackedLine & { variantId: unknown };
/** The roles that can refund an online payment (the owner's); only they are told one is owed. */
const REFUNDERS = roles.filter((role) => hasPermission([role], "refund:write"));
async function actor(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], permission);
  return user;
}
async function timeline(
  orderId: unknown,
  actorId: string,
  dimension: Dimension | "cod" | "payment",
  previous: string,
  next: string,
  session: mongoose.ClientSession,
  notes?: string,
) {
  await OrderTimelineEvent.create(
    [{ orderId, actorId, dimension, previous, next, notes }],
    { session },
  );
}
/** Takes an order off its rider, back to "Packed, no rider", noting why; the caller saves the order. */
async function takeOffRider(
  order: OrderDoc,
  actorId: string,
  session: mongoose.ClientSession,
  note: string,
) {
  const previous = order.deliveryStatus;
  assertTransition("delivery", previous, "unassigned");
  order.deliveryStatus = "unassigned";
  order.assignedTo = undefined;
  await timeline(order._id, actorId, "delivery", previous, "unassigned", session, note);
  return previous;
}
/**
 * Puts an order's set-aside stock back on sale. Only active reservations are touched and each is
 * marked released, so running it twice for one order can't free the same stock twice.
 */
async function releaseStock(
  order: OrderDoc,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const reservations = await InventoryReservation.find({
    orderId: order._id,
    status: "active",
  }).session(session);
  let units = 0;
  for (const r of reservations) {
    await InventoryItem.updateOne(
      { variantId: r.variantId, reserved: { $gte: r.quantity } },
      { $inc: { reserved: -r.quantity } },
      { session },
    );
    r.status = "released";
    await r.save({ session });
    await InventoryMovement.create(
      [
        {
          orderId: order._id,
          variantId: r.variantId,
          actorId,
          quantity: r.quantity,
          kind: "release",
        },
      ],
      { session },
    );
    units += r.quantity;
  }
  return units;
}
/** A reason typed by staff, ending as a sentence, for a message to the customer. */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
/**
 * After a delivery didn't go through, the customer hears the same thing whichever way staff send
 * it out again (Try again, Change rider or Remove rider).
 */
async function tellCustomerTryAgain(order: OrderDoc, session: mongoose.ClientSession) {
  await notify(
    {
      userId: order.customerId,
      type: "delivery",
      title: "Your delivery will be tried again",
      body: `${order.number} will go out again with a rider. You'll get a message when it is on the way.`,
      href: `/account/orders/${order._id}`,
    },
    session,
  );
}
/**
 * Tells a rider that staff took an order off their list. It used to just vanish from their phone,
 * so a rider who had already collected the parcel could set off with an order no longer theirs.
 */
async function tellRider(
  order: OrderDoc,
  rider: { id?: string; previous: string; what: string },
  actorId: string,
  session: mongoose.ClientSession,
) {
  if (!rider.id || rider.id === actorId) return;
  await notify(
    {
      userId: rider.id,
      type: "delivery",
      title: `${order.number} is off your list`,
      // after a missed attempt the rider has the parcel; before setting off they may not yet
      body: `${rider.what} ${
        rider.previous === "attempted"
          ? "Please bring the parcel back to the shop."
          : "If you have already collected the parcel, please bring it back to the shop."
      }`,
      href: "/delivery",
    },
    session,
  );
}
// payments stay on the owner's Refunds page; the order page never moves money
const PAID_ONLINE =
  "This order was paid online, so the refund comes first: the owner handles it separately from the Refunds page. Once the full amount is refunded, you can close the order here.";
/**
 * Takes a rider's not-yet-started deliveries back to "Packed, no rider", e.g. when the rider is
 * paused or leaves. Orders already out for delivery can't be taken back: the rider has them in
 * hand, so the caller is told how many there are instead.
 */
export async function releaseRiderOrders(
  riderId: string,
  actorId: string,
  session: mongoose.ClientSession,
  note: string,
) {
  const onTheRoad = await Order.countDocuments({
    assignedTo: riderId,
    orderStatus: "confirmed",
    deliveryStatus: "out-for-delivery",
  }).session(session);
  if (onTheRoad)
    throw Error(
      `This rider has ${onTheRoad} order${onTheRoad === 1 ? "" : "s"} out for delivery right now. Mark ${onTheRoad === 1 ? "it" : "them"} delivered or failed first.`,
    );
  const open = await Order.find({
    assignedTo: riderId,
    orderStatus: "confirmed",
    deliveryStatus: { $in: ["assigned", "attempted"] },
  }).session(session);
  for (const order of open) {
    await takeOffRider(order, actorId, session, note);
    await order.save({ session });
  }
  return open.length;
}
export async function changeOrderStatus(actorId: string, input: unknown) {
  await actor(actorId, "order:manage");
  const data = z
    .object({
      orderId: objectId,
      dimension: z.enum(["order", "fulfilment"]),
      next: z.string().max(30),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    const field =
      data.dimension === "order" ? "orderStatus" : "fulfilmentStatus";
    assertTransition(data.dimension, order[field], data.next);
    if (
      data.dimension === "order" &&
      data.next !== "confirmed" &&
      data.next !== "completed"
    )
      throw Error("This operation is unavailable.");
    if (order.orderStatus === "cancelled")
      throw Error("This order is cancelled.");
    // a part refund (say, for items that weren't packed) mustn't stop the order going on
    if (order.paymentMethod === "razorpay" && !paidOnline(order))
      throw Error("This order has not been paid.");
    if (data.dimension === "fulfilment" && order.orderStatus !== "confirmed")
      throw Error("Confirm the order before packing.");
    if (data.dimension === "fulfilment" && data.next === "packed") {
      const checklist = await PackingChecklist.findOne({
        orderId: order._id,
      }).session(session);
      const gaps = checklistGaps(order, checklist);
      if (gaps) throw Error(gaps);
    }
    if (
      data.dimension === "order" &&
      data.next === "completed" &&
      order.deliveryStatus !== "delivered"
    )
      throw Error("Delivery must be verified first.");
    const previous = order[field];
    order[field] = data.next;
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      data.dimension,
      previous,
      data.next,
      session,
    );
    // the customer hears when the shop takes the order on and when it closes. Picking, packed and
    // ready are the shop's own steps (the order page's tracker shows them), and each used to send
    // "Order completed" before the order had even left the shop
    if (data.dimension === "order")
      await notify(
        {
          userId: order.customerId,
          type: "order",
          title:
            data.next === "confirmed" ? "Order confirmed" : "Order completed",
          body:
            data.next === "confirmed"
              ? `${order.number} is now being prepared.`
              : `${order.number} is complete. Thank you for shopping local.`,
          href: `/account/orders/${order._id}`,
        },
        session,
      );
  });
}
/**
 * Why "Mark packed" has to wait, naming the lines still to finish, or null when it can go ahead.
 * Lines are read again under today's rules, so a checklist saved before them is checked too; one
 * finished back then (say, a short line with a note in the old substitution box) never changed
 * the order, so it takes one more save before the parcel can go: that tells the customer, fixes
 * the bill and puts the stock that didn't go in back on sale.
 */
function checklistGaps(
  order: OrderDoc,
  checklist: { completedAt?: Date; items: (ChecklistEntry & { variantId: unknown })[] } | null,
) {
  if (!checklist) return "Complete the packing checklist first: count each item and save it.";
  const { open, behind } = reviewChecklist(order.items as OrderLine[], checklist.items);
  if (open.length)
    return `Complete the packing checklist first: ${open.join(", ")}. For anything packed short, tick “${NONE_LEFT}” or name the substitute, then save it.`;
  if (behind.length || !checklist.completedAt)
    return `Complete the packing checklist first: save it once more, so the order shows what was packed${
      behind.length ? ` for ${behind.join(", ")}` : ""
    }.`;
  return null;
}
/**
 * Sets the stock an order line holds to the units of its own item that went in the bag: the rest
 * goes back on sale, and if the packer finds more after all, it is set aside again while the shop
 * still has it free.
 */
async function holdPacked(
  order: OrderDoc,
  line: OrderLine,
  packed: number,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const reservation = await InventoryReservation.findOne({
    orderId: order._id,
    variantId: line.variantId,
  }).session(session);
  if (!reservation || reservation.status === "consumed") return;
  const held = reservation.status === "active" ? reservation.quantity : 0;
  if (packed === held) return;
  const change = packed - held;
  if (change < 0)
    await InventoryItem.updateOne(
      { variantId: line.variantId, reserved: { $gte: -change } },
      { $inc: { reserved: change } },
      { session },
    );
  else {
    const claimed = await InventoryItem.updateOne(
      {
        variantId: line.variantId,
        $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, change] },
      },
      { $inc: { reserved: change } },
      { session },
    );
    if (claimed.modifiedCount !== 1)
      throw Error(
        `Packed quantity for ${lineName(line)} can’t go back up to ${packed}: the stock count shows too few free to set aside again. Check the shelf and the stock count first.`,
      );
  }
  await InventoryMovement.create(
    [
      {
        orderId: order._id,
        variantId: line.variantId,
        actorId,
        quantity: Math.abs(change),
        kind: change < 0 ? "release" : "reserve",
      },
    ],
    { session },
  );
  // a line with nothing of its own item left keeps the last amount it held, like any release
  if (packed > 0) reservation.quantity = packed;
  reservation.status = packed > 0 ? "active" : "released";
  await reservation.save({ session });
}
/**
 * The offer's terms for working it out again: as they were at checkout, kept on the order, so an
 * owner editing the running offer doesn't change what customers already have. Orders placed
 * before the terms were kept read the offer as it is now.
 */
async function offerTerms(
  order: OrderDoc,
  session: mongoose.ClientSession,
): Promise<OfferTerms | null> {
  const applied = order.appliedPromotion;
  if (applied?.discountType && applied.discountValue != null)
    return {
      discountType: applied.discountType,
      discountValue: applied.discountValue,
      maximumDiscountPaise: applied.maximumDiscountPaise,
    };
  return applied?.promotionId
    ? Promotion.findById(applied.promotionId)
        .select("discountType discountValue maximumDiscountPaise")
        .session(session)
    : null;
}
/**
 * Brings the order in line with a finished checklist. Each line records what went in instead of
 * what was ordered, stock set aside for units that didn't go in goes back on sale, and the customer
 * is told. A cash bill is worked out again (so the rider collects the new total); an order paid
 * online keeps its bill and payment as they are, with the shortfall noted for the Refunds page and
 * the owners told what is owed. Saving the same checklist again changes nothing. Says whether
 * anything changed, and how many owners were told about a refund.
 */
async function applyPacking(
  order: OrderDoc,
  decisions: LineDecision[],
  actorId: string,
  session: mongoose.ClientSession,
) {
  const lines = order.items as OrderLine[];
  if (lines.every((line, index) => followsDecision(line, decisions[index])))
    return { changed: false, ownersTold: 0 };
  const totalBefore = order.totalPaise;
  const shortfallBefore = order.shortfallPaise;
  for (const [index, line] of lines.entries())
    await holdPacked(order, line, decisions[index].packed, actorId, session);
  // the saving as it was at checkout; the offer's own terms say how it shrinks
  const discountPaise =
    order.appliedPromotion?.discountPaise ?? order.promotionDiscountPaise ?? 0;
  const terms = discountPaise > 0 ? await offerTerms(order, session) : null;
  const bill = billForPacking({
    lines,
    decisions,
    deliveryPaise: order.deliveryPaise ?? 0,
    discountPaise,
    terms,
  });
  const charged = billFollowsPacking(order);
  const marked = decisions.some((d) => d.unavailable > 0 || d.substituteQuantity > 0);
  for (const [index, item] of order.items.entries()) {
    const decision = decisions[index];
    // undefined clears a field, so a line packed in full after all reads as ordered again
    item.orderedQuantity = marked ? decision.ordered : undefined;
    item.unavailableQuantity = decision.unavailable || undefined;
    item.substituteName = decision.substituteName;
    item.substituteQuantity = decision.substituteQuantity || undefined;
    if (charged) {
      item.quantity = bill.lines[index].quantity;
      item.linePaise = bill.lines[index].linePaise;
    }
  }
  if (charged) {
    const placed = order.originalTotalPaise ?? order.totalPaise;
    order.subtotalPaise = bill.subtotalPaise;
    order.promotionDiscountPaise = bill.promotionDiscountPaise;
    order.totalPaise = bill.totalPaise;
    order.originalTotalPaise = bill.totalPaise === placed ? undefined : placed;
  } else {
    // payments stay out: the total is what the customer paid, and it stays that way
    const shortfall = order.totalPaise - bill.totalPaise;
    order.shortfallPaise = shortfall > 0 ? shortfall : undefined;
  }
  await order.save({ session });
  await AuditLog.create(
    [
      {
        actorId,
        action: "packing.adjust",
        target: String(order._id),
        details: {
          number: order.number,
          billChanged: charged,
          totalBefore,
          totalAfter: order.totalPaise,
          shortfallPaise: order.shortfallPaise,
          lines: lines.map((line, index) => ({
            variantId: String(line.variantId),
            ordered: decisions[index].ordered,
            packed: decisions[index].packed,
            unavailable: decisions[index].unavailable,
            substituteName: decisions[index].substituteName,
            substituteQuantity: decisions[index].substituteQuantity,
          })),
        },
      },
    ],
    { session },
  );
  const message = packingMessage({
    number: order.number,
    lines: order.items,
    charged,
    totalPaise: order.totalPaise,
    originalTotalPaise: order.originalTotalPaise,
    shortfallPaise: order.shortfallPaise,
  });
  await notify(
    {
      userId: order.customerId,
      type: "order",
      title: message.title,
      body: message.body,
      href: `/account/orders/${order._id}`,
    },
    session,
  );
  // payments stay out: nothing is refunded here, but the customer has just been promised a
  // refund and only the owners can make it, so each of them hears what is owed (whoever saved
  // the checklist is told on the page instead)
  const owed = charged
    ? null
    : refundOwedNotice({
        number: order.number,
        lines: order.items,
        shortfallPaise: order.shortfallPaise,
        previousPaise: shortfallBefore,
      });
  if (!owed) return { changed: true, ownersTold: 0 };
  const owners = await User.find({
    _id: { $ne: actorId },
    roles: { $in: REFUNDERS },
    active: true,
  })
    .select("_id")
    .session(session);
  for (const owner of owners)
    await notify(
      {
        userId: owner._id,
        type: "refund",
        title: owed.title,
        body: owed.body,
        // the Refunds page opens with this order chosen; with nothing owed, the order says why
        href: order.shortfallPaise
          ? `/super-admin/refunds?order=${order._id}`
          : `/admin/orders/${order._id}`,
      },
      session,
    );
  return { changed: true, ownersTold: owners.length };
}
/** What a saved checklist did, for the message under the Save button. */
export type PackingResult = {
  complete: boolean;
  /** Lines packed short with nothing said yet about the rest. */
  waiting: string[];
  /** The order changed to match (and the customer was told). */
  changed: boolean;
  /** The bill follows packing (cash on delivery); false when paid online. */
  charged: boolean;
  totalPaise: number;
  originalTotalPaise?: number;
  shortfallPaise?: number;
  /** Owners told about the refund now owed, not counting whoever saved. */
  ownersTold: number;
  /**
   * After a change: lines the shelf had fewer of than ordered. Their stock goes back on sale, so
   * the count needs checking or the shop sells what isn't there.
   */
  recount: string[];
  /** After a change: what went in instead ("1 × Reynolds pen"), still on its own stock count. */
  substitutes: string[];
};
/**
 * Saves the packer's checklist. A line packed short needs a word about the rest: none left, the
 * substitute that went in, or both with a count. Until every line has one, the checklist is kept
 * as work in progress and the order doesn't change; once it has, the order is brought in line
 * (see applyPacking).
 */
export async function savePacking(
  actorId: string,
  input: unknown,
): Promise<PackingResult> {
  await actor(actorId, "packing:write");
  const data = z
    .object({
      orderId: objectId,
      items: z
        .array(
          z.object({
            variantId: objectId,
            packedQuantity: z.number().int().min(0).max(100),
            missing: z.boolean(),
            substitution: z.string().trim().max(120).default(""),
            // blank: all of the rest went in as the substitute
            substituteQuantity: z.number().int().min(0).max(100).optional(),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  let result: PackingResult | undefined;
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      orderStatus: "confirmed",
      fulfilmentStatus: "picking",
    }).session(session);
    if (!order) throw Error("This order is not in the picking queue.");
    if (
      data.items.length !== order.items.length ||
      new Set(data.items.map((i) => i.variantId)).size !== data.items.length
    )
      throw Error("Check every item exactly once.");
    const lines = order.items as OrderLine[];
    const decisions = lines.map((line) => {
      const entry = data.items.find((i) => i.variantId === String(line.variantId));
      if (!entry) throw Error("Check every item exactly once.");
      const decision = decideLine(line, entry);
      if (decision.problem) throw Error(decision.problem);
      return decision;
    });
    const waiting = lines.flatMap((line, index) =>
      decisions[index].waiting ? [waitingLabel(line, decisions[index])] : [],
    );
    const complete = !waiting.length;
    // an empty bag is a cancelled order, and cancelling also frees the delivery slot
    if (complete && decisions.every((d) => d.packed + d.substituteQuantity === 0))
      throw Error(
        "Nothing is packed for this order. If none of it is in the shop, cancel the order instead.",
      );
    await PackingChecklist.updateOne(
      { orderId: data.orderId },
      {
        $set: {
          packerId: actorId,
          items: data.items,
          ...(complete ? { completedAt: new Date() } : {}),
        },
        ...(!complete ? { $unset: { completedAt: 1 } } : {}),
      },
      { upsert: true, session },
    );
    const { changed, ownersTold } = complete
      ? await applyPacking(order, decisions, actorId, session)
      : { changed: false, ownersTold: 0 };
    await AuditLog.create(
      [
        {
          actorId,
          action: "packing.checklist",
          target: data.orderId,
          details: { complete, items: data.items },
        },
      ],
      { session },
    );
    const packedLines = order.items as OrderLine[];
    result = {
      complete,
      waiting,
      changed,
      charged: billFollowsPacking(order),
      totalPaise: order.totalPaise,
      originalTotalPaise: order.originalTotalPaise ?? undefined,
      shortfallPaise: order.shortfallPaise ?? undefined,
      ownersTold,
      recount: changed
        ? packedLines.filter((line) => (line.unavailableQuantity ?? 0) > 0).map(lineName)
        : [],
      substitutes: changed
        ? packedLines
            .filter((line) => (line.substituteQuantity ?? 0) > 0 && line.substituteName)
            .map((line) => `${line.substituteQuantity} × ${line.substituteName}`)
        : [],
    };
  });
  return result!;
}
export async function assignDelivery(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assign");
  const data = z
    .object({ orderId: objectId, partnerId: objectId })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const partner = await User.exists({
      _id: data.partnerId,
      roles: "delivery",
      active: true,
    }).session(session);
    if (!partner) throw Error("Select an active delivery partner.");
    const order = await Order.findOne({
      _id: data.orderId,
      orderStatus: "confirmed",
      fulfilmentStatus: "ready",
      deliveryStatus: "unassigned",
    }).session(session);
    if (!order) throw Error("This order is not ready for assignment.");
    order.assignedTo = data.partnerId;
    order.deliveryStatus = "assigned";
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      "unassigned",
      "assigned",
      session,
    );
    await notify(
      {
        userId: order.customerId,
        type: "delivery",
        title: "Delivery partner assigned",
        body: `${order.number} is ready and has been assigned for delivery.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}
export async function partnerTransition(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assigned");
  const data = z
    .object({
      orderId: objectId,
      next: z.enum(["out-for-delivery", "attempted", "failed"]),
      reason: z.string().max(500).default(""),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      assignedTo: actorId,
      orderStatus: "confirmed",
    }).session(session);
    if (!order) throw Error("This delivery is not assigned to you.");
    assertTransition("delivery", order.deliveryStatus, data.next);
    if (
      ["attempted", "failed"].includes(data.next) &&
      data.reason.trim().length < 5
    )
      throw Error("Enter the reason this delivery could not be completed.");
    if (["attempted", "failed"].includes(data.next))
      await DeliveryAttempt.create(
        [{ orderId: order._id, partnerId: actorId, reason: data.reason }],
        { session },
      );
    const previous = order.deliveryStatus;
    order.deliveryStatus = data.next;
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      previous,
      data.next,
      session,
      data.reason,
    );
    await notify(
      {
        userId: order.customerId,
        type: "delivery",
        title:
          data.next === "out-for-delivery"
            ? "Your order is on the way"
            : "Delivery needs your attention",
        body:
          data.next === "out-for-delivery"
            ? `${order.number} is out for delivery.`
            : `${order.number}: ${data.reason}`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}

/** What the customer still owes on an order the store has closed. */
const settledNote = (order: OrderDoc) =>
  order.paymentStatus === "refunded"
    ? " Your online payment has been refunded in full."
    : " Nothing is due.";
/** Why the store can't cancel this order from where it is now. */
function cannotCancel(order: OrderDoc) {
  if (order.orderStatus === "cancelled") return "This order is already cancelled.";
  if (order.orderStatus === "completed" || order.deliveryStatus === "delivered")
    return "This order was delivered, so it can't be cancelled.";
  if (order.deliveryStatus === "out-for-delivery")
    return "This order is out for delivery, so it can't be cancelled now. Once the rider records it as not delivered, you can mark it returned to shop.";
  return "This delivery didn't go through. Use Try again or Returned to shop instead.";
}
const notWaiting = (order: OrderDoc) =>
  order.orderStatus === "cancelled"
    ? "This order is already cancelled."
    : "This delivery isn't waiting for a decision any more. Refresh the page to see where it is.";
/** Why the rider can't be changed from where the order is now. */
function riderFixed(order: OrderDoc) {
  if (order.deliveryStatus === "out-for-delivery")
    return "This order is out for delivery with its rider. If they can't deliver it, you can change the rider then.";
  if (order.orderStatus === "confirmed" && order.deliveryStatus === "failed")
    return "This delivery failed. Use Try again to give it to a rider again.";
  return "This order's rider can't be changed now. Refresh the page to see where it is.";
}

/**
 * The store calls an order off before it leaves the shop. Its stock, delivery slot and offer are
 * freed exactly once (a second attempt finds the order already cancelled inside the same
 * transaction), it comes off any rider (who is told, in case they already have the parcel), and
 * the customer is told why.
 */
export async function cancelByStore(actorId: string, input: unknown) {
  await actor(actorId, "order:manage");
  const data = z
    .object({
      orderId: objectId,
      reason: z
        .string()
        .trim()
        .min(5, "Enter the reason for cancelling (at least 5 characters).")
        .max(500),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    if (!cancellable(order)) throw Error(cannotCancel(order));
    if (paidOnline(order)) throw Error(PAID_ONLINE);
    assertTransition("order", order.orderStatus, "cancelled");
    const before = {
      orderStatus: order.orderStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      deliveryStatus: order.deliveryStatus,
      riderId: order.assignedTo ? String(order.assignedTo) : undefined,
    };
    const units = await releaseStock(order, actorId, session);
    await DeliverySlot.updateOne(
      { _id: order.slotId, reserved: { $gte: 1 } },
      { $inc: { reserved: -1 } },
      { session },
    );
    const offerReturned = await returnOffer(order._id, session);
    if (order.deliveryStatus === "assigned")
      await takeOffRider(order, actorId, session, "Order cancelled; taken off the rider");
    order.orderStatus = "cancelled";
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "order",
      before.orderStatus,
      "cancelled",
      session,
      data.reason,
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "order.cancel",
          target: data.orderId,
          details: {
            number: order.number,
            reason: data.reason,
            before,
            unitsReleased: units,
            offerReturned,
          },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: order.customerId,
        type: "order",
        title: "Order cancelled",
        body: `The store cancelled ${order.number}. Reason: ${sentence(data.reason)}${settledNote(order)}`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
    await tellRider(
      order,
      { id: before.riderId, previous: before.deliveryStatus, what: "The store cancelled this order." },
      actorId,
      session,
    );
  });
}

/**
 * "Try again" after a delivery didn't go through: back to "Packed, no rider" so it can be given
 * to a rider again. Its stock stays set aside for this customer.
 */
export async function retryDelivery(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assign");
  const data = z.object({ orderId: objectId }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    if (!awaitingDecision(order)) throw Error(notWaiting(order));
    const riderId = order.assignedTo ? String(order.assignedTo) : undefined;
    const previous = await takeOffRider(
      order,
      actorId,
      session,
      "Trying again: back in Packed, no rider",
    );
    await order.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "delivery.retry",
          target: data.orderId,
          details: { number: order.number, previous, riderId },
        },
      ],
      { session },
    );
    await tellCustomerTryAgain(order, session);
    // a rider who closed it as failed already knows; after a missed attempt it was still on their list
    if (previous === "attempted")
      await tellRider(
        order,
        { id: riderId, previous, what: "The store will send it out again later." },
        actorId,
        session,
      );
  });
}

/**
 * "Returned to shop": the parcel from a delivery that didn't go through is back on the shelf.
 * Its stock goes back on sale and the order is closed as cancelled. The delivery slot is not
 * given back: the run in it already happened.
 */
export async function returnToShop(actorId: string, input: unknown) {
  await actor(actorId, "order:manage");
  const data = z.object({ orderId: objectId }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    if (!awaitingDecision(order)) throw Error(notWaiting(order));
    if (paidOnline(order)) throw Error(PAID_ONLINE);
    const previous = order.deliveryStatus;
    assertTransition("delivery", previous, "returned");
    assertTransition("order", order.orderStatus, "cancelled");
    const units = await releaseStock(order, actorId, session);
    const offerReturned = await returnOffer(order._id, session);
    // the rider stays on the record: they made the run and brought the parcel back
    order.deliveryStatus = "returned";
    order.orderStatus = "cancelled";
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      previous,
      "returned",
      session,
      "Parcel back in the shop; items back on the shelf",
    );
    await timeline(
      order._id,
      actorId,
      "order",
      "confirmed",
      "cancelled",
      session,
      "Closed after a failed delivery: returned to shop",
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "order.return-to-shop",
          target: data.orderId,
          details: {
            number: order.number,
            previous,
            riderId: order.assignedTo ? String(order.assignedTo) : undefined,
            unitsReleased: units,
            offerReturned,
          },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: order.customerId,
        type: "order",
        title: "Order cancelled",
        body: `${order.number} couldn't be delivered and is back at the store, so the order is cancelled.${settledNote(order)}`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}

/** Hands an order to another active rider, before the delivery starts or after a missed attempt. */
export async function changeRider(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assign");
  const data = z
    .object({ orderId: objectId, partnerId: objectId })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const partner = await User.findOne({
      _id: data.partnerId,
      roles: "delivery",
      active: true,
    }).session(session);
    if (!partner) throw Error("Select an active delivery partner.");
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    if (!riderChangeable(order)) throw Error(riderFixed(order));
    const from = order.assignedTo ? String(order.assignedTo) : undefined;
    if (from === data.partnerId)
      throw Error("Select a different delivery partner: this one already has the order.");
    const previousRider = from
      ? await User.findById(from).select("name").session(session)
      : null;
    const previous = order.deliveryStatus;
    // the new rider starts from the beginning: they still have to set off with it
    if (previous !== "assigned") assertTransition("delivery", previous, "assigned");
    order.assignedTo = partner._id;
    order.deliveryStatus = "assigned";
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      previous,
      "assigned",
      session,
      `Rider changed from ${previousRider?.name ?? "the previous rider"} to ${partner.name}`,
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "delivery.reassign",
          target: data.orderId,
          details: { number: order.number, from, to: data.partnerId, previous },
        },
      ],
      { session },
    );
    await tellRider(
      order,
      { id: from, previous, what: `The store gave it to ${partner.name}.` },
      actorId,
      session,
    );
    if (previous === "attempted") await tellCustomerTryAgain(order, session);
  });
}

/** Takes an order off its rider, back to "Packed, no rider", before the delivery starts or after a missed attempt. */
export async function removeRider(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assign");
  const data = z.object({ orderId: objectId }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    if (!riderChangeable(order)) throw Error(riderFixed(order));
    const from = order.assignedTo ? String(order.assignedTo) : undefined;
    const rider = from
      ? await User.findById(from).select("name").session(session)
      : null;
    const previous = await takeOffRider(
      order,
      actorId,
      session,
      `${rider?.name ?? "The rider"} taken off; back in Packed, no rider`,
    );
    await order.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "delivery.unassign",
          target: data.orderId,
          details: { number: order.number, from, previous },
        },
      ],
      { session },
    );
    await tellRider(
      order,
      { id: from, previous, what: "The store took you off this delivery." },
      actorId,
      session,
    );
    // after a missed attempt this is the same move as Try again, so the customer hears the same
    if (previous === "attempted") await tellCustomerTryAgain(order, session);
  });
}

export async function resolveCODDiscrepancy(actorId: string, input: unknown) {
  await actor(actorId, "cod:reconcile");
  const data = z
    .object({
      orderId: objectId,
      resolution: z.string().trim().min(5).max(500),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const collection = await CODCollection.findOne({
      orderId: data.orderId,
      reconciledAt: { $exists: true },
      discrepancyPaise: { $ne: 0 },
      discrepancyResolvedAt: null,
    }).session(session);
    if (!collection)
      throw Error("This discrepancy is already resolved or unavailable.");
    collection.discrepancyResolution = data.resolution;
    collection.discrepancyResolvedBy = actorId;
    collection.discrepancyResolvedAt = new Date();
    await collection.save({ session });
    await Order.updateOne(
      { _id: data.orderId },
      { $set: { codStatus: "reconciled" } },
      { session },
    );
    await timeline(
      data.orderId,
      actorId,
      "cod",
      "discrepancy",
      "reconciled",
      session,
      data.resolution,
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "cod.discrepancy.resolve",
          target: data.orderId,
          details: {
            discrepancyPaise: collection.discrepancyPaise,
            resolution: data.resolution,
          },
        },
      ],
      { session },
    );
  });
}
export async function requestDeliveryOTP(
  customerId: string,
  orderInput: unknown,
) {
  await actor(customerId, "order:own");
  const id = objectId.parse(orderInput);
  const order = await Order.findOne({
    _id: id,
    customerId,
    orderStatus: "confirmed",
    deliveryStatus: "out-for-delivery",
  });
  if (!order)
    throw Error(
      "A delivery code is available when your order is out for delivery.",
    );
  await rateLimit(`delivery-code:${id}`, 3);
  const env = getEnv();
  const code = env.MOCK_OTP === "true" ? env.MOCK_OTP_CODE : otpCode();
  const subjectHash = digest(`delivery:${id}`);
  await OTPChallenge.updateMany(
    { subjectHash, purpose: "delivery", consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  const challenge = await OTPChallenge.create({
    subjectHash,
    purpose: "delivery",
    codeHash: otpDigest(subjectHash, code, env.AUTH_SECRET),
    expiresAt: new Date(Date.now() + 5 * 60000),
  });
  if (env.MOCK_OTP !== "true") {
    if (!env.SMS_API_URL || !env.SMS_API_TOKEN)
      throw Error("SMS delivery is unavailable.");
    const response = await fetch(env.SMS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SMS_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: `+91${order.address.phone}`,
        message: `Your delivery confirmation code for ${order.number} is ${code}. Share only after receiving your order.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await OTPChallenge.deleteOne({ _id: challenge._id });
      throw Error("Unable to send delivery code.");
    }
  }
  return env.MOCK_OTP === "true"
    ? `Development delivery code: ${code}`
    : "Delivery code sent to your address contact number.";
}
export async function completeDelivery(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assigned");
  const data = z
    .object({
      orderId: objectId,
      code: z.string().regex(/^\d{6}$/),
      cashPaise: z.coerce.number().int().min(0),
    })
    .parse(input);
  const order = await Order.findOne({
    _id: data.orderId,
    assignedTo: actorId,
    orderStatus: "confirmed",
    deliveryStatus: "out-for-delivery",
  });
  if (!order)
    throw Error("This delivery is not assigned to you or has already closed.");
  if (data.cashPaise !== (order.paymentMethod === "cod" ? order.totalPaise : 0))
    throw Error("The collected amount must match the amount due.");
  const subjectHash = digest(`delivery:${data.orderId}`);
  const challenge = await OTPChallenge.findOneAndUpdate(
    {
      subjectHash,
      purpose: "delivery",
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after", sort: { createdAt: -1 } },
  ).select("+codeHash");
  if (
    !challenge ||
    !equalHash(
      challenge.codeHash,
      otpDigest(subjectHash, data.code, getEnv().AUTH_SECRET),
    )
  )
    throw Error("Invalid or expired delivery code.");
  await mongoose.connection.transaction(async (session) => {
    const current = await Order.findOne({
      _id: order._id,
      assignedTo: actorId,
      orderStatus: "confirmed",
      deliveryStatus: "out-for-delivery",
    }).session(session);
    if (!current) throw Error("This delivery has already changed.");
    const claimed = await OTPChallenge.updateOne(
      { _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      { session },
    );
    if (claimed.modifiedCount !== 1)
      throw Error("Delivery code was already used.");
    const reservations = await InventoryReservation.find({
      orderId: order._id,
      status: "active",
    }).session(session);
    // a line none of whose own item went in (not available, or all swapped) holds no stock any more
    const holding = (current.items as OrderLine[]).filter((line) => packedOf(line) > 0);
    if (reservations.length !== holding.length)
      throw Error("Inventory reservation mismatch");
    for (const r of reservations) {
      const sold = await InventoryItem.updateOne(
        {
          variantId: r.variantId,
          reserved: { $gte: r.quantity },
          onHand: { $gte: r.quantity },
        },
        { $inc: { reserved: -r.quantity, onHand: -r.quantity } },
        { session },
      );
      if (sold.modifiedCount !== 1)
        throw Error("Inventory invariant violation");
      r.status = "consumed";
      await r.save({ session });
      await InventoryMovement.create(
        [
          {
            orderId: current._id,
            variantId: r.variantId,
            actorId,
            quantity: r.quantity,
            kind: "sale",
          },
        ],
        { session },
      );
    }
    if (current.paymentMethod === "cod") {
      await CODCollection.create(
        [
          {
            orderId: current._id,
            collectorId: actorId,
            expectedPaise: current.totalPaise,
            collectedPaise: data.cashPaise,
            collectedAt: new Date(),
          },
        ],
        { session },
      );
      current.codStatus = "collected";
      current.paymentStatus = "paid";
      await timeline(
        current._id,
        actorId,
        "cod",
        "uncollected",
        "collected",
        session,
      );
      await timeline(
        current._id,
        actorId,
        "payment",
        "pending",
        "paid",
        session,
      );
    }
    current.deliveryStatus = "delivered";
    await current.save({ session });
    await timeline(
      current._id,
      actorId,
      "delivery",
      "out-for-delivery",
      "delivered",
      session,
    );
    await notify(
      {
        userId: current.customerId,
        type: "delivery",
        title: "Order delivered",
        body: `${current.number} was delivered successfully.`,
        href: `/account/orders/${current._id}`,
      },
      session,
    );
  });
}
export async function reconcileCOD(actorId: string, input: unknown) {
  await actor(actorId, "cod:reconcile");
  const data = z
    .object({
      orderId: objectId,
      receivedPaise: z.coerce.number().int().min(0),
      note: z.string().max(500),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const collection = await CODCollection.findOne({
      orderId: data.orderId,
      reconciledAt: null,
    }).session(session);
    if (!collection)
      throw Error("This collection is already reconciled or unavailable.");
    const discrepancy = collection.collectedPaise - data.receivedPaise;
    if (discrepancy !== 0 && data.note.trim().length < 5)
      throw Error("Explain the cash discrepancy.");
    collection.receivedPaise = data.receivedPaise;
    collection.discrepancyPaise = discrepancy;
    collection.reconciliationNote = data.note;
    collection.reconciledBy = actorId;
    collection.reconciledAt = new Date();
    await collection.save({ session });
    if (discrepancy === 0) {
      await Order.updateOne(
        { _id: data.orderId, codStatus: "collected" },
        { $set: { codStatus: "reconciled" } },
        { session },
      );
      await timeline(
        data.orderId,
        actorId,
        "cod",
        "collected",
        "reconciled",
        session,
      );
    }
    await AuditLog.create(
      [
        {
          actorId,
          action: "cod.reconcile",
          target: data.orderId,
          details: {
            receivedPaise: data.receivedPaise,
            discrepancyPaise: discrepancy,
            note: data.note,
          },
        },
      ],
      { session },
    );
  });
}
