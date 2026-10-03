import type mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { Product, User } from "../db/models";
import { Notification, WishlistItem } from "./models";
import { shopperVisible } from "../catalog/visibility";

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
  if (session) return Notification.create([payload], { session });
  return Notification.create(payload);
}
