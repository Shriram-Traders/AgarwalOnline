import { z } from "zod";
import { connectDB } from "../db/connect";
import { User } from "../db/models";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { istDate } from "../commerce/delivery";
import { Refund } from "../payments/models";
import { notify } from "../engagement/service";
import { hasPermission, type Role } from "../auth/permissions";
import { LIST_TOKEN } from "../lists/links";
import { firstName, newToken } from "../lists/service";
import { CLASSES, FAMILY_LIMITS, Family, SPENT } from "./models";

const familyName = z.string().trim().min(2, "Give the family a name.").max(40, "Keep the family name under 40 characters.");
const childInput = z.object({
  childId: z.union([objectId, z.literal("")]).default(""),
  name: z.string().trim().min(1, "Give the child’s name.").max(40, "Keep the name under 40 characters."),
  school: z.string().trim().max(80, "Keep the school name under 80 characters.").default(""),
  className: z.enum(CLASSES, { error: "Pick the child’s class." }),
});
const duplicate = (e: unknown) => (e as { code?: number } | null)?.code === 11000;

async function customer(userId: string) {
  await connectDB();
  if (!(await User.exists({ _id: objectId.parse(userId), roles: "customer", active: true })))
    throw Error("UNAUTHENTICATED");
}

/** "2026-27": the school year in India turns over in June. */
export function academicYear(now: Date) {
  const [year, month] = istDate(now).split("-").map(Number);
  const start = month >= 6 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export async function familyOf(userId: string) {
  await connectDB();
  return Family.findOne({ adults: userId });
}

export async function createFamily(userId: string, nameInput: unknown) {
  const name = familyName.parse(nameInput);
  await customer(userId);
  try {
    const family = await Family.create({ name, ownerId: userId, adults: [userId], inviteToken: newToken() });
    return String(family._id);
  } catch (e) {
    if (duplicate(e)) throw Error("You’re already in a family.");
    throw e;
  }
}

/** What an invite link shows before joining: the family's name and who sent it, nothing else. */
export async function invitedFamily(tokenInput: unknown) {
  const token = z.string().regex(LIST_TOKEN).safeParse(tokenInput);
  if (!token.success) return null;
  await connectDB();
  const family = await Family.findOne({ inviteToken: token.data }).select("name ownerId adults");
  if (!family) return null;
  const owner = await User.findById(family.ownerId).select("name");
  return { family, ownerName: firstName(owner?.name) };
}

/** Each link lets one person in: joining swaps the token in the same write. */
export async function joinFamily(userId: string, tokenInput: unknown) {
  const found = await invitedFamily(tokenInput);
  if (!found) throw Error("This invite link was used or replaced. Ask for a new one.");
  await customer(userId);
  const { family } = found;
  if (family.adults.some((a: unknown) => String(a) === userId)) return;
  try {
    const joined = await Family.updateOne(
      { _id: family._id, inviteToken: String(tokenInput), [`adults.${FAMILY_LIMITS.adults - 1}`]: { $exists: false } },
      { $addToSet: { adults: userId }, $set: { inviteToken: newToken() } },
    );
    if (!joined.matchedCount)
      throw Error(`This family already has ${FAMILY_LIMITS.adults} adults, or the link was just used.`);
  } catch (e) {
    if (duplicate(e)) throw Error("You’re already in a family. Leave it first to join this one.");
    throw e;
  }
  const person = await User.findById(userId).select("name");
  await notify({
    userId: family.ownerId,
    type: "family",
    title: `${firstName(person?.name)} joined “${family.name}”`,
    body: "Their orders from now on show in Family spend. The link they used no longer works.",
    href: "/account/family",
  });
}

export async function leaveFamily(userId: string) {
  const family = await familyOf(userId);
  if (!family) throw Error("You’re not in a family.");
  if (String(family.ownerId) === userId)
    throw Error("The owner can’t leave. Remove the others, then delete the family.");
  await Family.updateOne({ _id: family._id }, { $pull: { adults: userId } });
}

/** Owner-only changes run as one conditional write; no match means not the owner. */
async function asOwner(ownerId: string, update: object) {
  await connectDB();
  const result = await Family.updateOne({ ownerId, adults: ownerId }, update);
  if (!result.matchedCount) throw Error("Only the family’s owner can do that.");
}

export async function removeAdult(ownerId: string, personInput: unknown) {
  const personId = objectId.parse(personInput);
  if (personId === ownerId) throw Error("You can’t remove yourself. Delete the family instead.");
  await asOwner(ownerId, { $pull: { adults: personId } });
  const family = await Family.findOne({ ownerId }).select("name");
  await notify({
    userId: personId,
    type: "family",
    title: `You’re no longer in “${family?.name ?? "the family"}”`,
    body: "Your orders stay yours. The family can no longer see new ones.",
  });
}

export const resetFamilyLink = (ownerId: string) => asOwner(ownerId, { $set: { inviteToken: newToken() } });

/** Only when the owner is the last adult, so no one loses a family they are using. */
export async function deleteFamily(ownerId: string) {
  const family = await familyOf(ownerId);
  if (!family || String(family.ownerId) !== ownerId) throw Error("Only the family’s owner can do that.");
  const result = await Family.deleteOne({ _id: family._id, ownerId, "adults.1": { $exists: false } });
  if (!result.deletedCount) throw Error("Remove the other adults before deleting the family.");
}

/** Any adult adds or edits a child; saving confirms the class for this school year. */
export async function saveChild(userId: string, input: unknown) {
  const { childId, ...child } = childInput.parse(input);
  await customer(userId);
  const fields = { ...child, year: academicYear(new Date()) };
  const result = childId
    ? await Family.updateOne(
        { adults: userId, "children._id": childId },
        { $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`children.$.${key}`, value])) },
        { runValidators: true },
      )
    : await Family.updateOne(
        { adults: userId, [`children.${FAMILY_LIMITS.children - 1}`]: { $exists: false } },
        { $push: { children: fields } },
        { runValidators: true },
      );
  if (!result.matchedCount)
    throw Error(childId ? "This child is not in your family." : `You can add up to ${FAMILY_LIMITS.children} children.`);
}

export async function removeChild(userId: string, childInput: unknown) {
  const childId = objectId.parse(childInput);
  await customer(userId);
  const result = await Family.updateOne({ adults: userId, "children._id": childId }, { $pull: { children: { _id: childId } } });
  if (!result.matchedCount) throw Error("This child is not in your family.");
}

/**
 * Orders the family sees: its current adults' orders, and every order put on its tab, which the
 * family still owes for after the adult who placed it has left.
 */
const familyOrders = (family: { _id: unknown; adults: unknown[] }) => ({
  familyId: family._id,
  $or: [{ customerId: { $in: family.adults } }, { paymentMethod: "tab" }],
});

type SpendRow = {
  id: string;
  number: string;
  buyerId: string;
  buyer: string;
  forKey: string;
  forName: string | null;
  netPaise: number;
  at: Date;
};

/**
 * Twelve IST months of what the family's current adults ordered here, newest first.
 * Cancelled orders and failed deliveries are left out and processed refunds are taken off,
 * so the totals match what was actually paid.
 */
export async function familySpend(family: { _id: unknown; adults: unknown[] }, now = new Date()) {
  const [year, month] = istDate(now).split("-").map(Number);
  // IST midnight on the 1st, eleven months before this one
  const since = new Date(Date.UTC(year, month - 12, 1) - 330 * 60 * 1000);
  const orders = await Order.find({
    ...familyOrders(family),
    ...SPENT,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .select("number customerId forPerson totalPaise createdAt");
  const [refunds, buyers] = await Promise.all([
    Refund.find({ orderId: { $in: orders.map((o) => o._id) }, status: "processed" }).select("orderId amountPaise"),
    User.find({ _id: { $in: orders.map((o) => o.customerId) } }).select("name"),
  ]);
  const refunded = (id: unknown) =>
    refunds.filter((r) => String(r.orderId) === String(id)).reduce((sum, r) => sum + r.amountPaise, 0);
  const rows: SpendRow[] = orders.map((order) => ({
    id: String(order._id),
    number: order.number,
    buyerId: String(order.customerId),
    buyer: firstName(buyers.find((b) => String(b._id) === String(order.customerId))?.name),
    forKey: order.forPerson?.personId ? String(order.forPerson.personId) : "everyone",
    forName: order.forPerson?.name ?? null,
    netPaise: Math.max(0, order.totalPaise - refunded(order._id)),
    at: order.createdAt,
  }));
  const months: { month: string; totalPaise: number; orders: SpendRow[] }[] = [];
  const people = new Map<string, { key: string; name: string | null; totalPaise: number }>();
  for (const row of rows) {
    const key = istDate(row.at).slice(0, 7);
    let bucket = months.find((m) => m.month === key);
    if (!bucket) months.push((bucket = { month: key, totalPaise: 0, orders: [] }));
    bucket.totalPaise += row.netPaise;
    bucket.orders.push(row);
    const person = people.get(row.forKey) ?? { key: row.forKey, name: row.forName, totalPaise: 0 };
    person.totalPaise += row.netPaise;
    people.set(row.forKey, person);
  }
  return {
    months,
    people: [...people.values()].sort((a, b) => b.totalPaise - a.totalPaise),
    totalPaise: rows.reduce((sum, row) => sum + row.netPaise, 0),
  };
}

/** An invoice its buyer, order staff, or a current adult of the buyer's family may open. Private orders stay the buyer's. */
export async function invoiceOrder(user: { id: string; roles: readonly Role[] }, idInput: unknown) {
  const id = objectId.safeParse(idInput);
  if (!id.success) return null;
  await connectDB();
  if (hasPermission(user.roles, "order:manage")) return Order.findById(id.data);
  const own = await Order.findOne({ _id: id.data, customerId: user.id });
  if (own) return own;
  const family = await Family.findOne({ adults: user.id }).select("adults");
  return family ? Order.findOne({ _id: id.data, ...familyOrders(family) }) : null;
}
