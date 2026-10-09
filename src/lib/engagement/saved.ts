import "server-only";
import { cache } from "react";
import { currentUser } from "../auth/session";
import { connectDB } from "../db/connect";
import { WishlistItem } from "./models";

/**
 * The products the signed-in shopper has saved, asked once per request however many cards show
 * a heart. Empty for guests.
 */
export const savedProductIds = cache(async (): Promise<Set<string>> => {
  const user = await currentUser();
  if (!user) return new Set();
  await connectDB();
  const ids: unknown[] = await WishlistItem.find({ customerId: user.id }).distinct("productId");
  return new Set(ids.map(String));
});
