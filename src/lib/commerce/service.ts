import { paymentsEnabled, paymentConfig } from "../payments/provider";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { POLICY_VERSION } from "../legal/version";
import {
  InventoryItem,
  Product,
  ProductVariant,
  ServiceArea,
  User,
} from "../db/models";
import {
  Address,
  CartLine,
  DeliverySlot,
  InventoryMovement,
  InventoryReservation,
  Order,
  OrderTimelineEvent,
  Sequence,
  SystemSetting,
} from "./models";
import {
  defaultRules,
  deliveryFee,
  earliestDelivery,
  istDate,
  rulesSchema,
  stillBookable,
} from "./delivery";
import { notify, notifyNewOrder } from "../engagement/service";
import { bestPromotion, returnOffer } from "../promotions/service";
import { Promotion, PromotionRedemption } from "../promotions/models";
import { isShopperVisible, shopperVisible } from "../catalog/visibility";
import { resolveBasketLines } from "./basket-lines";
import { chargeTab, orderFamily } from "../family/checkout";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record.");
export type { UnavailableLine } from "./basket-lines";
export async function cartFor(customerId: string) {
  return (await basketFor(customerId)).lines;
}
/**
 * The basket split into lines that can be bought and lines that can't. The unavailable ones are
 * kept (not silently skipped) so the basket can show them with a Remove button; checkout would
 * otherwise refuse the order over an item the customer can't see.
 */
export async function basketFor(customerId: string) {
  await connectDB();
  const lines = await CartLine.find({ customerId });
  return resolveBasketLines(
    lines.map((line) => ({ id: String(line._id), variantId: line.variantId, quantity: line.quantity })),
  );
}
export async function setCartLine(
  customerId: string,
  variantInput: unknown,
  quantityInput: unknown,
) {
  objectId.parse(customerId);
  const variantId = objectId.parse(variantInput);
  const quantity = z.coerce.number().int().min(0).max(100).parse(quantityInput);
  await connectDB();
  if (quantity === 0) {
    await CartLine.deleteOne({ customerId, variantId });
    return;
  }
  const variant = await ProductVariant.findById(variantId);
  if (
    !variant ||
    variant.active === false ||
    quantity > variant.maxQuantity ||
    !(await Product.exists({ _id: variant.productId, ...shopperVisible }))
  )
    throw Error("This product or quantity is unavailable.");
  await CartLine.updateOne(
    { customerId, variantId },
    { $set: { quantity } },
    { upsert: true, runValidators: true },
  );
}
export async function deliveryRules() {
  await connectDB();
  const setting = await SystemSetting.findOne({ key: "delivery" });
  return rulesSchema.parse(setting?.value ?? defaultRules);
}
export async function checkout(customerId: string, input: unknown) {
  const data = z
    .object({
      addressId: objectId,
      slotId: objectId,
      idempotencyKey: z.string().uuid(),
      method: z.enum(["cod", "razorpay", "tab"]),
      promotionCode: z.string().max(24).optional(),
      // the checkout box: agreeing to the Terms as they are now, not as an old open tab showed them
      termsVersion: z.literal(POLICY_VERSION, {
        error: "Our Terms were updated. Reload the page, then tick the box again.",
      }),
      // who in the family it is for: an adult or child id, "" for everyone, "private" to keep it out
      forId: z.union([objectId, z.literal("private"), z.literal("")]).optional(),
    })
    .strict()
    .parse(input);
  if (data.method === "razorpay") {
    if (!paymentsEnabled())
      throw Error("This payment method is not available.");
    paymentConfig();
  }
  await connectDB();
  const user = await User.findOne({
    _id: customerId,
    active: true,
    roles: "customer",
  });
  if (!user) throw Error("UNAUTHENTICATED");
  let resultId = "";
  await mongoose.connection.transaction(async (session) => {
    const existing = await Order.findOne({
      customerId,
      idempotencyKey: data.idempotencyKey,
    }).session(session);
    if (existing) {
      resultId = String(existing._id);
      return;
    }
    const address = await Address.findOne({
      _id: data.addressId,
      customerId,
    }).session(session);
    if (!address) throw Error("Select your delivery address.");
    const family = await orderFamily(customerId, data.forId, session);
    const area = await ServiceArea.findOne({
      _id: address.areaId,
      enabled: true,
      pincodes: address.pin,
    }).session(session);
    if (!area || (data.method === "cod" && !area.codEnabled))
      throw Error("Cash on Delivery is unavailable for this address.");
    const settings = await SystemSetting.findOne({ key: "delivery" }).session(
      session,
    );
    const rules = rulesSchema.parse(settings?.value ?? defaultRules);
    const earliest = earliestDelivery(new Date(), rules);
    const slot = await DeliverySlot.findOne({
      _id: data.slotId,
      areaId: area._id,
      enabled: true,
      date: { $gte: earliest },
    }).session(session);
    if (
      !slot ||
      rules.blackoutDates.includes(slot.date) ||
      rules.holidays.includes(new Date(`${slot.date}T00:00:00Z`).getUTCDay())
    )
      throw Error("This delivery slot is unavailable.");
    // a same-day window that has (nearly) passed, picked on a checkout page left open too long
    if (!stillBookable(slot))
      throw Error("This delivery time has passed. Please pick a later one.");
    const lines = await CartLine.find({ customerId }).session(session);
    if (!lines.length) throw Error("Your basket is empty.");
    if (lines.length > 100) throw Error("Too many basket items.");
    const items = [];
    let subtotal = 0;
    let merchandiseSavingsPaise = 0;
    for (const line of lines) {
      const variant = await ProductVariant.findById(line.variantId).session(
        session,
      );
      const product = variant
        ? await Product.findById(variant.productId).session(session)
        : null;
      // name the item and say what to do: a vague "an item is unavailable" left people stuck
      if (!variant || variant.active === false || !isShopperVisible(product))
        throw Error(
          `Your basket has ${product ? product.name.en : "an item"}, which is no longer sold. Remove it from your basket to continue.`,
        );
      if (line.quantity > variant.maxQuantity)
        throw Error(
          `Your basket has ${line.quantity} of ${product.name.en}, but the limit is ${variant.maxQuantity} per order. Change the quantity in your basket.`,
        );
      const stock = await InventoryItem.updateOne(
        {
          variantId: variant._id,
          $expr: {
            $gte: [{ $subtract: ["$onHand", "$reserved"] }, line.quantity],
          },
        },
        { $inc: { reserved: line.quantity } },
        { session },
      );
      if (stock.modifiedCount !== 1) {
        const inventory = await InventoryItem.findOne({
          variantId: variant._id,
        }).session(session);
        const left = Math.max(
          0,
          (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0),
        );
        throw Error(
          left
            ? `Your basket has ${line.quantity} of ${product.name.en}, but only ${left} ${left === 1 ? "is" : "are"} left. Change the quantity in your basket.`
            : `Your basket has ${product.name.en}, which is sold out. Remove it from your basket to continue.`,
        );
      }
      const linePaise = variant.pricePaise * line.quantity;
      subtotal += linePaise;
      merchandiseSavingsPaise +=
        Math.max(0, variant.mrpPaise - variant.pricePaise) * line.quantity;
      items.push({
        variantId: variant._id,
        name: product.name.en,
        label: variant.label,
        quantity: line.quantity,
        pricePaise: variant.pricePaise,
        linePaise,
      });
    }
    const fee = deliveryFee(subtotal, area.feePaise, rules);
    const promotion = await bestPromotion(
      subtotal,
      data.promotionCode,
      customerId,
      session,
    );
    const promotionDiscountPaise = promotion.selected?.discountPaise ?? 0;
    const total = subtotal - promotionDiscountPaise + fee;
    if (
      !Number.isSafeInteger(total) ||
      (data.method === "cod" && total > area.codLimitPaise)
    )
      throw Error("Order exceeds the Cash on Delivery limit.");
    // the family tab: refused when private, closed, overdue or over the limit, checked under a lock
    let tabFamily = null;
    if (data.method === "tab") {
      if (data.forId === "private") throw Error("Your family tab can’t pay for a private order.");
      tabFamily = await chargeTab(customerId, total, session);
    }
    const capacity = await DeliverySlot.updateOne(
      { _id: slot._id, $expr: { $lt: ["$reserved", "$capacity"] } },
      { $inc: { reserved: 1 } },
      { session },
    );
    if (capacity.modifiedCount !== 1)
      throw Error("This delivery slot is full.");
    const day = istDate(new Date()).replaceAll("-", "");
    const sequence = await Sequence.findOneAndUpdate(
      { key: day },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
    const [order] = await Order.create(
      [
        {
          customerId,
          number: `AGS-${day}-${String(sequence.value).padStart(5, "0")}`,
          idempotencyKey: data.idempotencyKey,
          items,
          address: {
            name: address.name,
            phone: address.phone,
            line: address.line,
            pin: address.pin,
            instructions: address.instructions,
            areaName: area.name,
          },
          slotId: slot._id,
          deliveryDate: slot.date,
          deliveryWindow: slot.label,
          subtotalPaise: subtotal,
          merchandiseSavingsPaise,
          promotionDiscountPaise,
          ...(promotion.selected
            ? {
                appliedPromotion: {
                  promotionId: promotion.selected.promotion._id,
                  code: promotion.selected.promotion.code,
                  name: promotion.selected.promotion.name,
                  discountPaise: promotionDiscountPaise,
                  // kept with the order: packing works the offer out again on these terms
                  discountType: promotion.selected.promotion.discountType,
                  discountValue: promotion.selected.promotion.discountValue,
                  maximumDiscountPaise: promotion.selected.promotion.maximumDiscountPaise || undefined,
                },
              }
            : {}),
          deliveryPaise: fee,
          totalPaise: total,
          paymentMethod: data.method,
          ...family,
          ...(data.method === "razorpay"
            ? { expiresAt: new Date(Date.now() + 15 * 60 * 1000) }
            : {}),
          termsVersion: data.termsVersion,
          termsAcceptedAt: new Date(),
        },
      ],
      { session },
    );
    for (const item of items) {
      await InventoryReservation.create(
        [
          {
            orderId: order._id,
            variantId: item.variantId,
            quantity: item.quantity,
            ...(data.method === "razorpay"
              ? { expiresAt: new Date(Date.now() + 15 * 60 * 1000) }
              : {}),
          },
        ],
        { session },
      );
      await InventoryMovement.create(
        [
          {
            orderId: order._id,
            variantId: item.variantId,
            actorId: customerId,
            quantity: item.quantity,
            kind: "reserve",
          },
        ],
        { session },
      );
    }
    await OrderTimelineEvent.create(
      [
        {
          orderId: order._id,
          actorId: customerId,
          dimension: "order",
          previous: "draft",
          next: "placed",
        },
      ],
      { session },
    );
    if (promotion.selected) {
      const selectedPromotion = promotion.selected.promotion;
      const claimFilter: Record<string, unknown> = {
        _id: selectedPromotion._id,
        active: true,
      };
      if (selectedPromotion.globalLimit)
        claimFilter.redemptionCount = { $lt: selectedPromotion.globalLimit };
      const promotionClaim = await Promotion.updateOne(
        claimFilter,
        { $inc: { redemptionCount: 1 } },
        { session },
      );
      if (promotionClaim.modifiedCount !== 1)
        throw Error("This offer has just ended. Refresh your basket.");
      await PromotionRedemption.create(
        [
          {
            promotionId: selectedPromotion._id,
            customerId,
            orderId: order._id,
            discountPaise: promotionDiscountPaise,
          },
        ],
        { session },
      );
    }
    await notify(
      {
        userId: customerId,
        type: "order",
        title: "Order placed",
        body: `${order.number} is confirmed with the store and waiting for review.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
    await notifyNewOrder(order, session);
    if (tabFamily && String(tabFamily.ownerId) !== customerId)
      await notify(
        {
          userId: tabFamily.ownerId,
          type: "family",
          title: `${user.name.trim().split(/\s+/)[0]} put ₹${total / 100} on the family tab`,
          body: `${order.number}. You can see every tab order on the Family page.`,
          href: "/account/family#tab",
        },
        session,
      );
    await CartLine.deleteMany({ customerId }, { session });
    resultId = String(order._id);
  });
  return resultId;
}
export async function cancelOrder(customerId: string, idInput: unknown) {
  const id = objectId.parse(idInput);
  await connectDB();
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: id,
      customerId,
      orderStatus: "placed",
      fulfilmentStatus: "unassigned",
      // nothing has been paid on these yet; a tab order simply comes off the tab
      paymentMethod: { $in: ["cod", "tab"] },
    }).session(session);
    if (!order) throw Error("This order can no longer be cancelled.");
    order.orderStatus = "cancelled";
    await order.save({ session });
    const reservations = await InventoryReservation.find({
      orderId: id,
      status: "active",
    }).session(session);
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
            variantId: r.variantId,
            orderId: id,
            actorId: customerId,
            quantity: r.quantity,
            kind: "release",
          },
        ],
        { session },
      );
    }
    await DeliverySlot.updateOne(
      { _id: order.slotId, reserved: { $gte: 1 } },
      { $inc: { reserved: -1 } },
      { session },
    );
    await returnOffer(id, session);
    await OrderTimelineEvent.create(
      [
        {
          orderId: id,
          actorId: customerId,
          dimension: "order",
          previous: "placed",
          next: "cancelled",
        },
      ],
      { session },
    );
    await notify(
      {
        userId: customerId,
        type: "order",
        title: "Order cancelled",
        body: `${order.number} was cancelled and reserved stock was released.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}

export async function reorder(customerId: string, orderInput: unknown) {
  const orderId = objectId.parse(orderInput);
  await connectDB();
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw Error("This order is unavailable.");
  // what they ordered, including anything packing found wasn't there (it may be back now)
  return addLinesToBasket(
    customerId,
    order.items.map((item: { variantId: unknown; quantity: number; orderedQuantity?: number }) => ({
      variantId: item.variantId,
      quantity: item.orderedQuantity ?? item.quantity,
    })),
  );
}
/** Adds lines to the basket, each capped at stock and the per-order limit; lines that cannot be bought are skipped. */
export async function addLinesToBasket(
  customerId: string,
  items: { variantId: unknown; quantity: number }[],
) {
  await connectDB();
  const user = await User.exists({
    _id: customerId,
    roles: "customer",
    active: true,
  });
  if (!user) throw Error("UNAUTHENTICATED");
  let added = 0;
  let skipped = 0;
  await mongoose.connection.transaction(async (session) => {
    // the driver may retry this callback; count from zero each time
    added = 0;
    skipped = 0;
    for (const item of items) {
      const variant = await ProductVariant.findById(item.variantId).session(
        session,
      );
      const product = variant
        ? await Product.exists({
            _id: variant.productId,
            ...shopperVisible,
          }).session(session)
        : null;
      const inventory = variant
        ? await InventoryItem.findOne({ variantId: variant._id }).session(
            session,
          )
        : null;
      const available = Math.max(
        0,
        (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0),
      );
      if (!variant || variant.active === false || !product || available < 1) {
        skipped++;
        continue;
      }
      const current = await CartLine.findOne({
        customerId,
        variantId: variant._id,
      }).session(session);
      const quantity = Math.min(
        variant.maxQuantity,
        available,
        (current?.quantity ?? 0) + item.quantity,
      );
      await CartLine.updateOne(
        { customerId, variantId: variant._id },
        { $set: { quantity } },
        { upsert: true, runValidators: true, session },
      );
      added++;
    }
  });
  if (!added) throw Error("These products are currently unavailable.");
  return { added, skipped };
}
