import type mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { Product, User } from "../db/models";
import { Notification, WishlistItem } from "./models";
import { shopperVisible } from "../catalog/visibility";
import { rolesWith, type Permission } from "../auth/permissions";
import { formatPrice } from "../display";
import { schedulePush } from "../push/service";

const recordId = z.preprocess(
  (value) => (typeof value === "string" ? value : String(value)),
  z.string().regex(/^[a-f\d]{24}$/i, "Invalid record."),
);

async function customer(customerId: string) {
  await connectDB();
  if (
    !(await User.exists({
      _id: recordId.parse(customerId),
      roles: "customer",
      active: true,
    }))
  )
    throw Error("UNAUTHENTICATED");
}

export async function toggleWishlist(
  customerId: string,
  productInput: unknown,
) {
  await customer(customerId);
  const productId = recordId.parse(productInput);
  if (!(await Product.exists({ _id: productId, ...shopperVisible })))
    throw Error("This product is unavailable.");
  const existing = await WishlistItem.findOne({ customerId, productId });
  if (existing) {
    await existing.deleteOne();
    return false;
  }
  await WishlistItem.create({ customerId, productId });
  return true;
}

/** Saves a product without toggling: filing it on a board keeps it in Saved too. */
export async function ensureSaved(customerId: string, productInput: unknown) {
  await customer(customerId);
  const productId = recordId.parse(productInput);
  if (!(await Product.exists({ _id: productId, ...shopperVisible })))
    throw Error("This product is unavailable.");
  await WishlistItem.updateOne({ customerId, productId }, { $setOnInsert: { customerId, productId } }, { upsert: true });
}

export async function markNotification(customerId: string, input: unknown) {
  await customer(customerId);
  const data = z.object({ notificationId: recordId.optional() }).parse(input);
  await Notification.updateMany(
    {
      userId: customerId,
      readAt: null,
      ...(data.notificationId ? { _id: data.notificationId } : {}),
    },
    { $set: { readAt: new Date() } },
  );
}

export async function notify(
  input: {
    userId: unknown;
    type: "order" | "payment" | "delivery" | "support" | "refund" | "system";
    title: string;
    body: string;
    href?: string;
  },
  session?: mongoose.ClientSession,
) {
  const payload = {
    ...input,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 500),
    expiresAt: new Date(Date.now() + 180 * 86400 * 1000),
  };
  if (session) {
    const created = await Notification.create([payload], { session });
    // pushed to their phone or PC once the transaction has committed
    schedulePush(String(created[0]._id), session);
    return created;
  }
  const created = await Notification.create(payload);
  schedulePush(String(created._id));
  return created;
}

/**
 * "New order AGS-… · ₹1,240 · 3 items · Kalpana S." for every staff member who manages orders,
 * in their bell and, if they turned it on, on their phone or PC, even with the workspace closed.
 */
export async function notifyNewOrder(
  order: {
    _id: unknown;
    number: string;
    totalPaise: number;
    paymentMethod?: string;
    items: { quantity: number }[];
    address?: { name?: string; areaName?: string };
  },
  session?: mongoose.ClientSession,
) {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const [first, ...rest] = (order.address?.name ?? "").trim().split(/\s+/);
  const who = first ? `${first}${rest.length ? ` ${rest[rest.length - 1].slice(0, 1)}.` : ""}` : null;
  const body = [
    formatPrice(order.totalPaise),
    `${count} ${count === 1 ? "item" : "items"}`,
    who,
    order.address?.areaName,
    order.paymentMethod === "cod" ? "cash on delivery" : order.paymentMethod === "razorpay" ? "paying online" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  await notifyPermitted(
    "order:manage",
    { type: "order", title: `New order ${order.number}`, body, href: `/admin/orders/${order._id}` },
    session,
  );
}

/** Notifies every active staff member who holds this permission, such as order:manage for a new order. */
export async function notifyPermitted(
  permission: Permission,
  input: Omit<Parameters<typeof notify>[0], "userId">,
  session?: mongoose.ClientSession,
) {
  const staff = await User.find({ active: true, roles: { $in: rolesWith(permission) } })
    .select("_id")
    .session(session ?? null);
  for (const person of staff) await notify({ ...input, userId: person._id }, session);
}
