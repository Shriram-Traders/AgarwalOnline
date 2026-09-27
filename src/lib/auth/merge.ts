import mongoose from "mongoose";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { Address, CartLine, Order } from "../commerce/models";
import { ChatConversation } from "../chat/models";
import { Complaint, ReturnRequest } from "../aftercare/models";
import { PromotionRedemption } from "../promotions/models";
import { Notification, WishlistItem } from "../engagement/models";
import { ProductReview } from "../reviews/models";
import { UploadedEvidence } from "../evidence/models";

/** Everything a customer can own. A Google account that owns any of it is never folded away. */
const OWNED: [mongoose.Model<unknown>, string][] = [
  [Order, "customerId"],
  [Address, "customerId"],
  [WishlistItem, "customerId"],
  [ChatConversation, "customerId"],
  [Complaint, "customerId"],
  [ReturnRequest, "customerId"],
  [ProductReview, "customerId"],
  [PromotionRedemption, "customerId"],
  [UploadedEvidence, "ownerId"],
];

const accounts = () => mongoose.connection.collection("authAccounts");

/**
 * Why the account `fromId` (made by a first Google sign-in) cannot be folded into `intoId`,
 * or null when it can. Only a fresh, phone-less, customer-only Google account with no orders
 * or other records qualifies, so folding it away never loses anything.
 */
export async function absorbBlocker(fromId: string, intoId: string) {
  await connectDB();
  if (fromId === intoId) return "This mobile number is already on your account.";
  const from = await User.findById(fromId);
  if (!from || from.phone || (from.roles as string[]).some((role) => role !== "customer"))
    return "This account can’t be combined automatically. Please contact the store.";
  const id = new mongoose.Types.ObjectId(fromId);
  if (!(await accounts().countDocuments({ userId: id, providerId: "google" })))
    return "This account can’t be combined automatically. Please contact the store.";
  for (const [model, field] of OWNED)
    if (await model.exists({ [field]: id }))
      return "This Google account already has its own orders or details. Please contact the store to combine the two accounts.";
  return null;
}

/**
 * Moves the Google sign-in from a fresh Google-only account to the customer's existing account,
 * brings its basket along, and deletes the now-empty account. The caller must already have proved
 * the person controls both: the Google account (signed in) and the existing account (phone OTP).
 */
export async function absorbGoogleAccount(fromId: string, intoId: string) {
  const blocker = await absorbBlocker(fromId, intoId);
  if (blocker) throw new Error(blocker);
  const from = new mongoose.Types.ObjectId(fromId);
  const into = new mongoose.Types.ObjectId(intoId);
  const removed = await User.findById(from).select("email name");
  await mongoose.connection.transaction(async (session) => {
    await accounts().updateMany(
      { userId: from, providerId: "google" },
      { $set: { userId: into, updatedAt: new Date() } },
      { session },
    );
    for (const line of await CartLine.find({ customerId: from }).session(session)) {
      const existing = await CartLine.exists({ customerId: into, variantId: line.variantId }).session(session);
      if (existing) await CartLine.deleteOne({ _id: line._id }).session(session);
      else await CartLine.updateOne({ _id: line._id }, { $set: { customerId: into } }).session(session);
    }
    await Notification.deleteMany({ userId: from }).session(session);
    await mongoose.connection.collection("authSessions").deleteMany({ userId: from }, { session });
    await User.deleteOne({ _id: from }).session(session);
    await AuditLog.create(
      [
        {
          actorId: into,
          action: "auth.google.merge",
          target: intoId,
          details: { removedAccount: fromId, googleEmail: removed?.email },
        },
      ],
      { session },
    );
  });
}
