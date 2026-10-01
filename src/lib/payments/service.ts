import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { User, InventoryItem, AuditLog } from "../db/models";
import {
  Order,
  InventoryReservation,
  InventoryMovement,
  DeliverySlot,
  OrderTimelineEvent,
} from "../commerce/models";
import { objectId } from "../commerce/service";
import { Payment, RazorpayWebhookEvent, Refund } from "./models";
import {
  RazorpayProvider,
  type PaymentProvider,
  type GatewayPayment,
  paymentConfig,
  paymentsEnabled,
  verifyCheckoutSignature,
  verifyHmac,
} from "./provider";
import { digest } from "../auth/crypto";
import { assertPermission, type Role } from "../auth/permissions";
import { notify } from "../engagement/service";
import { returnOffer } from "../promotions/service";
async function releaseOrder(
  order: mongoose.Document & {
    _id: unknown;
    customerId: unknown;
    slotId: unknown;
    orderStatus: string;
    paymentStatus: string;
  },
  session: mongoose.ClientSession,
  reason: string,
) {
  const reservations = await InventoryReservation.find({
    orderId: order._id,
    status: "active",
  }).session(session);
  for (const r of reservations) {
    const released = await InventoryItem.updateOne(
      { variantId: r.variantId, reserved: { $gte: r.quantity } },
      { $inc: { reserved: -r.quantity } },
      { session },
    );
    if (released.modifiedCount !== 1)
      throw Error("Inventory invariant violation");
    r.status = "released";
    await r.save({ session });
    await InventoryMovement.create(
      [
        {
          orderId: order._id,
          variantId: r.variantId,
          actorId: order.customerId,
          quantity: r.quantity,
          kind: "release",
        },
      ],
      { session },
    );
  }
  const capacity = await DeliverySlot.updateOne(
    { _id: order.slotId, reserved: { $gte: 1 } },
    { $inc: { reserved: -1 } },
    { session },
  );
  if (capacity.modifiedCount !== 1) throw Error("Slot invariant violation");
  // the offer on an order that is called off goes back to the customer
  await returnOffer(order._id, session);
  const previous = order.orderStatus;
  order.orderStatus = "cancelled";
  await OrderTimelineEvent.create(
    [
      {
        orderId: order._id,
        actorId: order.customerId,
        dimension: "order",
        previous,
        next: "cancelled",
        notes: reason,
      },
    ],
    { session },
  );
}
export async function initiatePayment(
  customerId: string,
  orderInput: unknown,
  provider: PaymentProvider = new RazorpayProvider(),
) {
  const id = objectId.parse(orderInput);
  await connectDB();
  if (!(await User.exists({ _id: customerId, active: true, roles: "customer" })))
    throw Error("UNAUTHENTICATED");
  const order = await Order.findOne({
    _id: id,
    customerId,
    paymentMethod: "razorpay",
    orderStatus: "placed",
    paymentStatus: { $in: ["pending"] },
    expiresAt: { $gt: new Date() },
  });
  if (!order) throw Error("This payment is no longer available.");
  const existing = await Payment.findOne({ orderId: id });
  if (existing) {
    if (existing.providerOrderId && existing.state === "pending")
      return {
        id: existing.providerOrderId,
        amount: existing.amountPaise,
        currency: "INR" as const,
      };
    throw Error(
      "Payment initialization is being reconciled. Please contact the store if it does not update.",
    );
  }
  // Unique orderId claims initialization before the external request. Never retry an ambiguous creation automatically.
  const payment = await Payment.create({
    orderId: id,
    amountPaise: order.totalPaise,
    state: "creating",
  });
  const created = await provider.createOrder({
    receipt: order.number,
    amount: order.totalPaise,
  });
  if (created.amount !== order.totalPaise)
    throw Error("Payment amount mismatch");
  await Payment.updateOne(
    { _id: payment._id, state: "creating" },
    { $set: { providerOrderId: created.id, state: "pending" } },
  );
  return created;
}
export async function applyGatewayPayment(
  entity: GatewayPayment,
  event: { id: string; type: string; payloadHash: string },
) {
  await connectDB();
  await mongoose.connection.transaction(async (session) => {
    if (
      await RazorpayWebhookEvent.exists({ eventId: event.id }).session(session)
    )
      return;
    const payment = await Payment.findOne({
      providerOrderId: entity.order_id,
    }).session(session);
    if (!payment) throw Error("Payment mapping is not ready");
    const order = await Order.findById(payment.orderId).session(session);
    if (
      !order ||
      entity.amount !== payment.amountPaise ||
      entity.amount !== order.totalPaise ||
      entity.currency !== "INR"
    )
      throw Error("Payment amount mismatch");
    let outcome = "ignored";
    if (
      entity.status === "captured" &&
      entity.captured &&
      payment.state !== "paid" &&
      payment.state !== "refunded" &&
      payment.state !== "partially-refunded"
    ) {
      payment.providerPaymentId = entity.id;
      payment.state = "paid";
      order.paymentStatus = "paid";
      if (
        order.orderStatus === "cancelled" ||
        (order.expiresAt && order.expiresAt.getTime() <= Date.now())
      ) {
        if (order.orderStatus !== "cancelled")
          await releaseOrder(
            order,
            session,
            "Payment captured after the reservation expired",
          );
        payment.refundNeeded = true;
        outcome = "captured-refund-required";
      } else {
        outcome = "captured";
      }
      await OrderTimelineEvent.create(
        [
          {
            orderId: order._id,
            actorId: order.customerId,
            dimension: "payment",
            previous: "pending",
            next: "paid",
            notes: outcome,
          },
        ],
        { session },
      );
      await payment.save({ session });
      await order.save({ session });
    } else if (
      entity.status === "failed" &&
      !["paid", "refunded", "partially-refunded"].includes(payment.state)
    ) {
      payment.state = "failed";
      if (order.orderStatus !== "cancelled") {
        await releaseOrder(order, session, "Online payment failed");
        order.paymentStatus = "failed";
        await order.save({ session });
      }
      await payment.save({ session });
      outcome = "failed";
    }
    await RazorpayWebhookEvent.create(
      [
        {
          eventId: event.id,
          type: event.type,
          payloadHash: event.payloadHash,
          outcome,
        },
      ],
      { session },
    );
  });
}
export async function verifyCustomerPayment(
  customerId: string,
  input: unknown,
  provider: PaymentProvider = new RazorpayProvider(),
) {
  const data = z
    .object({
      orderId: objectId,
      paymentId: z.string().regex(/^pay_[A-Za-z\d]+$/),
      signature: z.string().regex(/^[a-f\d]{64}$/i),
    })
    .parse(input);
  await connectDB();
  const order = await Order.findOne({
    _id: data.orderId,
    customerId,
    paymentMethod: "razorpay",
  });
  if (!order) throw Error("FORBIDDEN");
  const payment = await Payment.findOne({ orderId: order._id });
  if (
    !payment?.providerOrderId ||
    !verifyCheckoutSignature(
      payment.providerOrderId,
      data.paymentId,
      data.signature,
      paymentConfig().RAZORPAY_KEY_SECRET,
    )
  )
    throw Error("Invalid payment signature");
  const entity = await provider.fetchPayment(data.paymentId);
  if (entity.order_id !== payment.providerOrderId)
    throw Error("Payment order mismatch");
  await applyGatewayPayment(entity, {
    id: `verify:${entity.id}:${entity.status}`,
    type: "checkout-verification",
    payloadHash: digest(JSON.stringify(entity)),
  });
  return entity.status === "captured" && entity.captured;
}
const eventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        order_id: z.string(),
        amount: z.number().int(),
        currency: z.literal("INR"),
        status: z.string(),
        captured: z.boolean(),
      }),
    }),
  }),
});
const refundEventSchema = z.object({
  event: z.enum(["refund.processed", "refund.failed"]),
  payload: z.object({
    refund: z.object({
      entity: z.object({
        id: z.string(),
        payment_id: z.string(),
        amount: z.number().int().positive(),
        status: z.string(),
      }),
    }),
  }),
});
export async function processWebhook(
  raw: string,
  signature: string,
  eventId: string,
  secret: string,
) {
  if (!verifyHmac(raw, signature, secret)) throw Error("INVALID_SIGNATURE");
  z.string().min(1).max(200).parse(eventId);
  const envelope = z.object({ event: z.string() }).parse(JSON.parse(raw));
  if (["refund.processed", "refund.failed"].includes(envelope.event)) {
    const data = refundEventSchema.parse(JSON.parse(raw));
    await applyRefundWebhook(data.payload.refund.entity, {
      id: eventId,
      type: data.event,
      payloadHash: digest(raw),
    });
    return;
  }
  if (
    !["payment.captured", "payment.failed", "payment.authorized"].includes(
      envelope.event,
    )
  )
    return;
  const data = eventSchema.parse(JSON.parse(raw));
  await applyGatewayPayment(data.payload.payment.entity, {
    id: eventId,
    type: data.event,
    payloadHash: digest(raw),
  });
}

async function refundActor(actorId: string) {
  await connectDB();
  const user = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], "refund:write");
  return user;
}

async function finishRefund(
  refundId: unknown,
  actorId: unknown,
  providerRefundId?: string,
  externalReference?: string,
) {
  await mongoose.connection.transaction(async (session) => {
    const refund = await Refund.findOne({
      _id: refundId,
      status: { $in: ["requested", "processing", "failed"] },
    }).session(session);
    if (!refund) return;
    const order = await Order.findById(refund.orderId).session(session);
    if (!order) throw Error("Order not found.");
    refund.status = "processed";
    refund.processedBy = actorId;
    if (providerRefundId) refund.providerRefundId = providerRefundId;
    if (externalReference) refund.externalReference = externalReference;
    refund.failureReason = undefined;
    await refund.save({ session });
    const totals = await Refund.aggregate([
      { $match: { orderId: order._id, status: "processed" } },
      { $group: { _id: null, amount: { $sum: "$amountPaise" } } },
    ]).session(session);
    const refundedPaise = totals[0]?.amount ?? refund.amountPaise;
    order.paymentStatus =
      refundedPaise >= order.totalPaise ? "refunded" : "partially-refunded";
    await order.save({ session });
    await Payment.updateOne(
      { orderId: order._id },
      {
        $set: {
          refundedPaise,
          state:
            refundedPaise >= order.totalPaise
              ? "refunded"
              : "partially-refunded",
          refundNeeded: false,
        },
      },
      { session },
    );
    await OrderTimelineEvent.create(
      [
        {
          orderId: order._id,
          actorId,
          dimension: "payment",
          previous: "paid",
          next: order.paymentStatus,
          notes: `Refund ₹${refund.amountPaise / 100}: ${refund.reason}`,
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "refund.processed",
          target: String(refund._id),
          details: {
            orderId: String(order._id),
            amountPaise: refund.amountPaise,
            mode: refund.mode,
          },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: order.customerId,
        type: "refund",
        title: "Refund completed",
        body: `₹${refund.amountPaise / 100} was refunded for ${order.number}.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}

export async function createRefund(actorId: string, input: unknown) {
  await refundActor(actorId);
  const data = z
    .object({
      orderId: objectId,
      amountPaise: z.coerce.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(input);
  let refundId = "";
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      paymentStatus: { $in: ["paid", "partially-refunded"] },
    }).session(session);
    if (!order) throw Error("Only paid orders can be refunded.");
    const payment = await Payment.findOne({ orderId: order._id }).session(
      session,
    );
    const reserved = await Refund.aggregate([
      {
        $match: {
          orderId: order._id,
          status: { $in: ["requested", "processing", "processed"] },
        },
      },
      { $group: { _id: null, amount: { $sum: "$amountPaise" } } },
    ]).session(session);
    if ((reserved[0]?.amount ?? 0) + data.amountPaise > order.totalPaise)
      throw Error("Refund amount exceeds the remaining paid amount.");
    const [refund] = await Refund.create(
      [
        {
          orderId: order._id,
          paymentId: payment?._id,
          requestedBy: actorId,
          amountPaise: data.amountPaise,
          reason: data.reason,
          mode: order.paymentMethod === "razorpay" ? "razorpay" : "manual",
        },
      ],
      { session },
    );
    refundId = String(refund._id);
    await AuditLog.create(
      [
        {
          actorId,
          action: "refund.requested",
          target: refundId,
          details: data,
        },
      ],
      { session },
    );
    await notify(
      {
        userId: order.customerId,
        type: "refund",
        title: "Refund started",
        body: `A refund of ₹${data.amountPaise / 100} is being arranged for ${order.number}.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
  return refundId;
}

export async function processRefund(
  actorId: string,
  input: unknown,
  provider: PaymentProvider = new RazorpayProvider(),
) {
  await refundActor(actorId);
  const data = z
    .object({
      refundId: objectId,
      externalReference: z.string().trim().max(120).default(""),
    })
    .parse(input);
  const refund = await Refund.findOne({
    _id: data.refundId,
    status: { $in: ["requested", "failed"] },
  });
  if (!refund) throw Error("This refund is already being processed.");
  if (refund.mode === "manual") {
    if (data.externalReference.length < 3)
      throw Error("Enter the cash or bank refund reference.");
    await finishRefund(refund._id, actorId, undefined, data.externalReference);
    return;
  }
  const payment = await Payment.findById(refund.paymentId);
  if (!payment?.providerPaymentId)
    throw Error("The captured payment is unavailable.");
  if (!paymentsEnabled())
    throw Error("Razorpay credentials are not configured.");
  const claim = await Refund.updateOne(
    { _id: refund._id, status: { $in: ["requested", "failed"] } },
    { $set: { status: "processing" }, $unset: { failureReason: 1 } },
  );
  if (!claim.modifiedCount)
    throw Error("This refund is already being processed.");
  try {
    const result = await provider.refund({
      paymentId: payment.providerPaymentId,
      amount: refund.amountPaise,
      receipt: `refund-${refund._id}`,
    });
    if (result.status === "processed")
      await finishRefund(refund._id, actorId, result.id);
    else
      await Refund.updateOne(
        { _id: refund._id },
        { $set: { providerRefundId: result.id, status: "processing" } },
      );
  } catch (error) {
    await Refund.updateOne(
      { _id: refund._id, status: "processing" },
      { $set: { status: "failed", failureReason: "Provider request failed" } },
    );
    throw error;
  }
}

async function applyRefundWebhook(
  entity: { id: string; payment_id: string; amount: number; status: string },
  event: { id: string; type: string; payloadHash: string },
) {
  await connectDB();
  if (await RazorpayWebhookEvent.exists({ eventId: event.id })) return;
  const refund = await Refund.findOne({ providerRefundId: entity.id });
  if (!refund || refund.amountPaise !== entity.amount)
    throw Error("Refund mapping mismatch");
  const payment = await Payment.findById(refund.paymentId);
  if (!payment || payment.providerPaymentId !== entity.payment_id)
    throw Error("Refund payment mismatch");
  if (entity.status === "processed")
    await finishRefund(refund._id, refund.requestedBy, entity.id);
  else
    await Refund.updateOne(
      { _id: refund._id },
      {
        $set: { status: "failed", failureReason: "Provider reported failure" },
      },
    );
  await RazorpayWebhookEvent.create({ ...event, outcome: entity.status });
}
export async function expireReservations() {
  await connectDB();
  const pending = await Order.find({
    paymentMethod: "razorpay",
    orderStatus: "placed",
    paymentStatus: { $in: ["pending", "failed"] },
    expiresAt: { $lte: new Date() },
  })
    .select("_id")
    .limit(100);
  let count = 0;
  for (const candidate of pending) {
    await mongoose.connection.transaction(async (session) => {
      const order = await Order.findOne({
        _id: candidate._id,
        orderStatus: "placed",
        paymentStatus: { $in: ["pending", "failed"] },
        expiresAt: { $lte: new Date() },
      }).session(session);
      if (!order) return;
      await releaseOrder(order, session, "Payment reservation expired");
      await order.save({ session });
      count++;
    });
  }
  return count;
}
