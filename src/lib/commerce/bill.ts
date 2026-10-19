import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { hasPermission, type Role } from "../auth/permissions";
import { gstinField, optionalField } from "../tax/gst";
import { saveTaxProfile, taxProfile } from "../tax/profile";
import { Order } from "./models";
import { objectId } from "./service";

type BillOrder = { number: string; bill?: { revision?: number | null } | null };

/**
 * The bill's number: the order number without its letters ("20261019-00001"), since the law allows a bill number
 * of 16 characters at most, unique in the year. A bill re-issued with a new name gets "R1", "R2"...
 */
export function billNumber(order: BillOrder, revision = order.bill?.revision ?? 0) {
  const base = order.number.replace(/^[A-Z]+-/, "");
  return revision > 0 ? `${base}R${revision}` : base;
}

/** The number of the bill a re-issued one replaces, or null for a first bill. */
export function previousBillNumber(order: BillOrder) {
  const revision = order.bill?.revision ?? 0;
  return revision > 0 ? billNumber(order, revision - 1) : null;
}

/** The shop's details for a bill being issued (at delivery): kept on the order, so a later rename doesn't change it. */
export async function billSeller() {
  const shop = await taxProfile(true);
  return { legalName: shop.legalName, address: shop.address, phone: shop.phone, gstin: shop.gstin };
}

/**
 * Who the bill is made out to, when it isn't the delivery name: another person, or a business with its GSTIN.
 * Before delivery it simply changes; after, the bill already given stands, and this becomes a new bill with a
 * new number (as Amazon and Flipkart do: a bill once issued isn't edited).
 */
export async function setBillTo(actorId: string, input: unknown) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true });
  if (!actor || !hasPermission(actor.roles as Role[], "order:manage")) throw Error("FORBIDDEN");
  const data = z
    .object({
      orderId: objectId,
      name: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.union([z.literal(""), z.string().min(2).max(80)])),
      gstin: optionalField(gstinField),
    })
    .parse(input);
  const order = await Order.findById(data.orderId);
  if (!order) throw Error("Order not found.");
  if (order.orderStatus === "cancelled") throw Error("A cancelled order has no bill to change.");
  const before = { name: order.bill?.name ?? "", gstin: order.bill?.gstin ?? "" };
  const after = { name: data.name, gstin: data.gstin ?? "" };
  if (before.name === after.name && before.gstin === after.gstin) return { reissued: false, number: billNumber(order) };
  const reissued = Boolean(order.bill?.issuedAt);
  order.set("bill.name", after.name || undefined);
  order.set("bill.gstin", after.gstin || undefined);
  if (reissued) order.set("bill.revision", (order.bill?.revision ?? 0) + 1);
  await order.save();
  await AuditLog.create({
    actorId,
    action: "order.bill-to",
    target: String(order._id),
    details: { before, after, reissued, billNumber: billNumber(order) },
  });
  return { reissued, number: billNumber(order) };
}

/**
 * The shop's own name on bills, changed from where the bills are made. It is Business details' legal name, so
 * every bill issued from now on carries it; bills already issued keep theirs. Owners only (saveTaxProfile checks).
 */
export async function setShopNameOnBills(actorId: string, input: unknown) {
  const { legalName } = z.object({ legalName: z.string().trim().min(2).max(120) }).parse(input);
  const { configured, ...current } = await taxProfile(true);
  void configured;
  await saveTaxProfile(actorId, { ...current, legalName });
}
