import { randomBytes } from "node:crypto";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { InventoryItem, Product, ProductVariant, User } from "../db/models";
import { addLinesToBasket, objectId } from "../commerce/service";
import { notify } from "../engagement/service";
import { LIST_TOKEN } from "./links";
import { ShoppingList } from "./models";

export const LIMITS = { lists: 30, items: 100, people: 10 } as const;
export type ListKind = "board" | "basket";
const listName = z.string().trim().min(1, "Give the list a name.").max(60, "Keep the list name under 60 characters.");
const quantity = z.coerce.number().int().min(0).max(100);
const listToken = z.string().regex(LIST_TOKEN);
export const newToken = () => randomBytes(18).toString("base64url");
/** Everyone who can open a list: its owner and the people who joined it. */
const members = (userId: string) => ({ $or: [{ ownerId: userId }, { collaborators: userId }] });
/** Where a list lives: a board has its own page, a shared basket opens in the basket. */
export const listHref = (list: { _id: unknown; kind?: string }) =>
  list.kind === "board" ? `/account/lists/${list._id}` : `/cart?basket=${list._id}`;
export const firstName = (name?: string) => name?.trim().split(/\s+/)[0] || "Someone";

/** The list, or null, when this person owns it or joined it. */
export async function memberList(userId: string, listInput: unknown) {
  const id = objectId.safeParse(listInput);
  if (!id.success) return null;
  await connectDB();
  return ShoppingList.findOne({ _id: id.data, ...members(userId) });
}
async function editable(userId: string, listInput: unknown) {
  const list = await memberList(userId, listInput);
  if (!list) throw Error("This list is unavailable.");
  return list;
}
/** Owner-only changes run as one conditional write; no match means not the owner (or no list). */
async function asOwner(userId: string, listInput: unknown, update: object) {
  await connectDB();
  const result = await ShoppingList.updateOne({ _id: objectId.parse(listInput), ownerId: userId }, update);
  if (!result.matchedCount) throw Error("Only the list’s owner can do that.");
}

export async function listsFor(userId: string, kind: ListKind) {
  await connectDB();
  // lists made before boards existed have no kind and are baskets
  const ofKind = kind === "board" ? { kind: "board" } : { kind: { $ne: "board" } };
  const all = await ShoppingList.find({ ...members(userId), ...ofKind }).sort({ updatedAt: -1 }).limit(60);
  const owners = await User.find({ _id: { $in: all.map((list) => list.ownerId) } }).select("name");
  const ownerName = (id: unknown) => firstName(owners.find((o) => String(o._id) === String(id))?.name);
  return {
    owned: all.filter((list) => String(list.ownerId) === userId),
    shared: all
      .filter((list) => String(list.ownerId) !== userId)
      .map((list) => Object.assign(list, { ownerName: ownerName(list.ownerId) })),
  };
}

export async function createList(userId: string, nameInput: unknown, kind: ListKind = "basket") {
  const name = listName.parse(nameInput);
  await connectDB();
  if ((await ShoppingList.countDocuments({ ownerId: userId })) >= LIMITS.lists)
    throw Error(`You can keep up to ${LIMITS.lists} boards and baskets. Delete one to start another.`);
  const list = await ShoppingList.create({ ownerId: userId, name, kind, shareToken: newToken(), inviteToken: newToken() });
  return String(list._id);
}

/** `add` tops a line up (from a product page); otherwise the quantity is set, and 0 removes the line. */
export async function saveListItem(
  userId: string,
  listInput: unknown,
  variantInput: unknown,
  quantityInput: unknown,
  add = false,
) {
  const list = await editable(userId, listInput);
  const variantId = objectId.parse(variantInput);
  const wanted = add ? quantity.min(1).parse(quantityInput) : quantity.parse(quantityInput);
  const line = list.items.find((item: { variantId: unknown }) => String(item.variantId) === variantId);
  if (!add && !wanted) {
    await ShoppingList.updateOne({ _id: list._id }, { $pull: { items: { variantId } } });
    return;
  }
  if (!add && !line) throw Error("This item is no longer on the list.");
  const variant = await ProductVariant.findById(variantId);
  if (!variant || !(await Product.exists({ _id: variant.productId, status: "published" })))
    throw Error("This product is unavailable.");
  const next = Math.min(variant.maxQuantity, 100, add ? (line?.quantity ?? 0) + wanted : wanted);
  if (line) {
    await ShoppingList.updateOne(
      { _id: list._id, "items.variantId": variantId },
      { $set: { "items.$.quantity": next } },
    );
    return;
  }
  if (list.items.length >= LIMITS.items) throw Error(`A list holds up to ${LIMITS.items} items.`);
  // conditional push: two people adding the same product at once still leave one line
  await ShoppingList.updateOne(
    { _id: list._id, "items.variantId": { $ne: variantId } },
    { $push: { items: { variantId, quantity: next, addedBy: userId } } },
    { runValidators: true },
  );
}

/**
 * Anyone with the link can look and buy. It lets them join and edit only while the
 * owner's switch is on; links sent before the switch existed stay look-only.
 */
export async function sharedList(tokenInput: unknown) {
  const token = listToken.safeParse(tokenInput);
  if (!token.success) return null;
  await connectDB();
  const list = await ShoppingList.findOne({ $or: [{ shareToken: token.data }, { inviteToken: token.data }] });
  return list ? { list, invite: list.inviteToken === token.data && list.linkCanEdit !== false } : null;
}

export async function joinList(userId: string, tokenInput: unknown) {
  const token = listToken.safeParse(tokenInput);
  await connectDB();
  const joinable = { linkCanEdit: { $ne: false } };
  const list = token.success ? await ShoppingList.findOne({ inviteToken: token.data, ...joinable }) : null;
  if (!list) throw Error("This link no longer lets people join. Ask for a new one.");
  const id = String(list._id);
  if (String(list.ownerId) === userId || list.collaborators.some((c: unknown) => String(c) === userId))
    return { id, href: listHref(list) };
  const joined = await ShoppingList.updateOne(
    { _id: list._id, inviteToken: token.data, ...joinable, [`collaborators.${LIMITS.people - 1}`]: { $exists: false } },
    { $addToSet: { collaborators: userId } },
  );
  if (!joined.matchedCount) throw Error(`This list already has ${LIMITS.people} people on it.`);
  const person = await User.findById(userId).select("name");
  await notify({
    userId: list.ownerId,
    type: "system",
    title: `${firstName(person?.name)} joined “${list.name}”`,
    body: "They can now add things and change amounts.",
    href: listHref(list),
  });
  return { id, href: listHref(list) };
}

export async function leaveList(userId: string, listInput: unknown) {
  await connectDB();
  await ShoppingList.updateOne({ _id: objectId.parse(listInput) }, { $pull: { collaborators: userId } });
}
export const removePerson = (userId: string, listInput: unknown, personInput: unknown) =>
  asOwner(userId, listInput, { $pull: { collaborators: objectId.parse(personInput) } });
export const resetLinks = (userId: string, listInput: unknown) =>
  asOwner(userId, listInput, { $set: { shareToken: newToken(), inviteToken: newToken() } });
export const setLinkEdit = (userId: string, listInput: unknown, on: boolean) =>
  asOwner(userId, listInput, { $set: { linkCanEdit: on } });
export async function deleteList(userId: string, listInput: unknown) {
  await connectDB();
  const result = await ShoppingList.deleteOne({ _id: objectId.parse(listInput), ownerId: userId });
  if (!result.deletedCount) throw Error("Only the list’s owner can do that.");
}

/** Members open a list by id; anyone signed in can copy one they were sent a link to. */
export async function listToBasket(userId: string, input: { listId?: unknown; token?: unknown }) {
  const list = input.token ? (await sharedList(input.token))?.list : await memberList(userId, input.listId);
  if (!list) throw Error("This list is unavailable.");
  return addLinesToBasket(userId, list.items);
}

/** Current product, price and stock for each line; lines whose product was withdrawn drop out. */
export async function describeItems(items: { variantId: unknown; quantity: number; addedBy: unknown }[]) {
  const variantIds = items.map((item) => item.variantId);
  const [variants, stock, people] = await Promise.all([
    ProductVariant.find({ _id: { $in: variantIds } }),
    InventoryItem.find({ variantId: { $in: variantIds } }),
    User.find({ _id: { $in: items.map((item) => item.addedBy) } }).select("name"),
  ]);
  const products = await Product.find({
    _id: { $in: variants.map((variant) => variant.productId) },
    status: "published",
  });
  const same = (a: unknown) => (b: { _id?: unknown; variantId?: unknown }) => String(b._id ?? b.variantId) === String(a);
  return items.flatMap((item) => {
    const variant = variants.find(same(item.variantId));
    const product = variant && products.find(same(variant.productId));
    if (!variant || !product) return [];
    const inventory = stock.find((row) => String(row.variantId) === String(variant._id));
    return [
      {
        variantId: String(variant._id),
        slug: product.slug as string,
        name: product.name as { en: string; mr: string },
        image: (product.images?.[0] ?? product.image) as string | undefined,
        label: variant.label as string,
        quantity: item.quantity,
        pricePaise: variant.pricePaise as number,
        maxQuantity: Math.min(variant.maxQuantity, 100),
        available: Math.max(0, (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0)),
        addedBy: firstName(people.find(same(item.addedBy))?.name),
      },
    ];
  });
}
