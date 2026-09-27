import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { ShoppingList } from "../src/lib/lists/models";
import { listPath } from "../src/lib/lists/links";
import * as lists from "../src/lib/lists/service";

describe("return path after signing in from a list link", () => {
  it("accepts only a shared-list path on this site", () => {
    expect(listPath("/lists/abcdefghijklmnopqrstuvwx")).toBe("/lists/abcdefghijklmnopqrstuvwx");
    for (const bad of [
      "https://evil.test/lists/abcdefghijklmnopqrstuvwx",
      "//evil.test/lists/abcdefghijklmnopqrstuvwx",
      "/lists/abcdefghijklmnopqrstuvwx/../../admin",
      "/lists/short",
      "/account",
      "/groups/abcdefghijklmnopqrstuvwx",
      "/admin/abcdefghijklmnopqrstuvwx",
      null,
    ])
      expect(listPath(bad)).toBeNull();
  });
});

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Shared lists", () => {
  let owner: string, friend: string, stranger: string, variantId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const m of [User, ShoppingList, CartLine, Notification]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    const users = await User.create([
      { name: "List Owner", phone: "9000000091", roles: ["customer"] },
      { name: "Friend Person", phone: "9000000092", roles: ["customer"] },
      { name: "Stranger", phone: "9000000093", roles: ["customer"] },
    ]);
    [owner, friend, stranger] = users.map((u: { _id: unknown }) => String(u._id));
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const product = await Product.create({
      slug: "list-notebook",
      name: { en: "List Notebook", mr: "वही" },
      description: { en: "Fictional", mr: "प्रात्यक्षिक" },
      brand: "TEST",
      categoryId: category._id,
      categorySlug: "paper",
      status: "published",
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: "LIST-NOTEBOOK",
      label: "1 pc",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 5000,
      mrpPaise: 6000,
    });
    variantId = String(variant._id);
    await InventoryItem.create({ variantId, onHand: 10 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("lets only people on the list change it", async () => {
    const id = await lists.createList(owner, "School list");
    await lists.saveListItem(owner, id, variantId, 2, true);
    await lists.saveListItem(owner, id, variantId, 1, true); // tops up, one line
    await expect(lists.saveListItem(stranger, id, variantId, 5)).rejects.toThrow("unavailable");
    const list = await ShoppingList.findById(id);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].quantity).toBe(3);
    await lists.saveListItem(owner, id, variantId, 0);
    expect((await ShoppingList.findById(id)).items).toHaveLength(0);
  });

  it("adds a collaborator only through the invite link and tells the owner", async () => {
    const id = await lists.createList(owner, "Office restock");
    const { shareToken, inviteToken } = await ShoppingList.findById(id);
    await expect(lists.joinList(friend, shareToken)).rejects.toThrow("no longer lets people join");
    expect((await lists.joinList(friend, inviteToken)).id).toBe(id);
    expect((await lists.joinList(friend, inviteToken)).id).toBe(id); // joining twice is harmless
    await lists.saveListItem(friend, id, variantId, 4, true);
    expect(await Notification.countDocuments({ userId: owner })).toBe(1);
    const { owned, shared } = await lists.listsFor(friend, "basket");
    expect(owned).toHaveLength(0);
    expect(shared.map((list) => [list.name, list.ownerName])).toEqual([["Office restock", "List"]]);
    // sharing stays with the owner
    await expect(lists.resetLinks(friend, id)).rejects.toThrow("owner");
    await expect(lists.removePerson(friend, id, owner)).rejects.toThrow("owner");
    await expect(lists.deleteList(friend, id)).rejects.toThrow("owner");
  });

  it("revokes old links and removed people", async () => {
    const id = await lists.createList(owner, "Monthly groceries");
    const { shareToken, inviteToken } = await ShoppingList.findById(id);
    await lists.joinList(friend, inviteToken);
    await lists.resetLinks(owner, id);
    await expect(lists.joinList(stranger, inviteToken)).rejects.toThrow("no longer lets people join");
    expect(await lists.sharedList(shareToken)).toBeNull();
    await lists.removePerson(owner, id, friend);
    await expect(lists.saveListItem(friend, id, variantId, 1, true)).rejects.toThrow("unavailable");
  });

  it("keeps boards and baskets apart, and a look-only link lets nobody join", async () => {
    const board = await lists.createList(owner, "Diwali gifts", "board");
    const basket = await lists.createList(owner, "Family monthly");
    expect((await lists.listsFor(owner, "board")).owned.map((l) => l.name)).toEqual(["Diwali gifts"]);
    expect((await lists.listsFor(owner, "basket")).owned.map((l) => l.name)).toEqual(["Family monthly"]);
    expect(lists.listHref({ _id: board, kind: "board" })).toBe(`/account/lists/${board}`);
    expect(lists.listHref({ _id: basket, kind: "basket" })).toBe(`/cart?basket=${basket}`);
    const { inviteToken } = await ShoppingList.findById(basket);
    // the owner's switch: off means the link shows the basket but lets nobody in
    await expect(lists.setLinkEdit(friend, basket, false)).rejects.toThrow("owner");
    await lists.setLinkEdit(owner, basket, false);
    expect((await lists.sharedList(inviteToken))?.invite).toBe(false);
    await expect(lists.joinList(friend, inviteToken)).rejects.toThrow("no longer lets people join");
    await lists.setLinkEdit(owner, basket, true);
    expect((await lists.joinList(friend, inviteToken)).href).toBe(`/cart?basket=${basket}`);
  });

  it("copies a list someone was sent into their own basket, capped at stock", async () => {
    const id = await lists.createList(owner, "Festival shopping");
    await lists.saveListItem(owner, id, variantId, 5, true);
    await InventoryItem.updateOne({ variantId }, { onHand: 2 });
    const { shareToken } = await ShoppingList.findById(id);
    expect((await lists.listToBasket(stranger, { token: shareToken })).added).toBe(1);
    expect((await CartLine.findOne({ customerId: stranger, variantId }))?.quantity).toBe(2);
    // without the link, the list id alone is not enough
    await expect(lists.listToBasket(stranger, { listId: id })).rejects.toThrow("unavailable");
  });
});
