import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { Notification } from "../src/lib/engagement/models";
import { ShoppingList } from "../src/lib/lists/models";
import { Family, SchoolKit } from "../src/lib/family/models";
import * as family from "../src/lib/family/service";
import * as kits from "../src/lib/family/kits";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("School kits", () => {
  let staff: string, parent: string, partner: string, other: string, board: string, pen: string, pencil: string, withdrawn: string;
  const year = family.academicYear(new Date());
  const nextYear = `${Number(year.slice(0, 4)) + 1}-${String((Number(year.slice(0, 4)) + 2) % 100).padStart(2, "0")}`;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const m of [User, Family, SchoolKit, CartLine, Notification, InventoryItem, ShoppingList]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    const users = await User.create([
      { name: "Store Staff", phone: "9000000071", roles: ["customer", "admin"] },
      { name: "Priya Sharma", phone: "9000000072", roles: ["customer"] },
      { name: "Rohan Sharma", phone: "9000000073", roles: ["customer"] },
      { name: "Other Parent", phone: "9000000074", roles: ["customer"] },
    ]);
    [staff, parent, partner, other] = users.map((u: { _id: unknown }) => String(u._id));
    const category = await Category.create({ slug: "school", name: { en: "School", mr: "शाळा" } });
    const make = async (slug: string, status: string, onHand: number) => {
      const product = await Product.create({
        slug,
        name: { en: slug, mr: slug },
        description: { en: "Fictional", mr: "प्रात्यक्षिक" },
        categoryId: category._id,
        categorySlug: "school",
        status,
      });
      const variant = await ProductVariant.create({
        productId: product._id,
        sku: slug.toUpperCase(),
        label: "1 pc",
        unit: "piece",
        packQuantity: 1,
        pricePaise: 5000,
        mrpPaise: 6000,
      });
      await InventoryItem.create({ variantId: variant._id, onHand });
      return String(variant._id);
    };
    pen = await make("kit-pen", "published", 10);
    pencil = await make("kit-pencil", "published", 1);
    withdrawn = await make("kit-withdrawn", "draft", 10);
    board = String(
      (
        await ShoppingList.create({
          ownerId: staff,
          kind: "board",
          name: "St. Mary's Class 5",
          shareToken: "kit-share-token-00000000",
          inviteToken: "kit-invite-token-0000000",
          items: [
            { variantId: pen, quantity: 2, addedBy: staff },
            { variantId: pencil, quantity: 3, addedBy: staff },
            { variantId: withdrawn, quantity: 1, addedBy: staff },
          ],
        })
      )._id,
    );
    await family.createFamily(parent, "Sharma family");
    await family.joinFamily(partner, (await family.familyOf(parent))!.inviteToken);
    await family.saveChild(parent, { name: "Aarav", school: "st. mary's", className: "5" });
    await family.saveChild(parent, { name: "Meera", school: "St. Mary's", className: "2" });
    await family.createFamily(other, "Other family");
    await family.saveChild(other, { name: "Kabir", school: "Other School", className: "5" });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const kit = (fields: object = {}) => ({ school: "St. Mary's", className: "5", year, boardId: board, ...fields });
  const aarav = async () => String((await family.familyOf(parent))!.children[0]._id);

  it("is kept by catalog staff only, one kit per school, class and year whatever the capitals", async () => {
    await expect(kits.saveKit(parent, kit())).rejects.toThrow("FORBIDDEN");
    const id = await kits.saveKit(staff, kit());
    expect((await SchoolKit.findById(id)).items).toHaveLength(3);
    await expect(kits.saveKit(staff, kit({ school: "ST. MARY'S" }))).rejects.toThrow("already a kit");
    await expect(kits.saveKit(staff, kit({ year: "2026-28" }))).rejects.toThrow("like 2026-27");
    await expect(kits.saveKit(staff, kit({ boardId: "" }))).rejects.toThrow("Pick the board");
    // editing without a board keeps the items
    await kits.saveKit(staff, { kitId: id, school: "St. Mary's High", className: "5", year });
    expect((await SchoolKit.findById(id)).items).toHaveLength(3);
    expect(await AuditLog.countDocuments({ action: "kit.save", target: id })).toBe(2);
  });

  it("tells each parent of a matching child once, on the first publish only", async () => {
    const id = await kits.saveKit(staff, kit());
    await expect(kits.setKitStatus(parent, { kitId: id, status: "published" })).rejects.toThrow("FORBIDDEN");
    expect(await kits.setKitStatus(staff, { kitId: id, status: "published" })).toBe(2); // Priya and Rohan, for Aarav
    await expect(kits.setKitStatus(staff, { kitId: id, status: "published" })).rejects.toThrow("already published");
    await kits.setKitStatus(staff, { kitId: id, status: "draft" });
    expect(await kits.setKitStatus(staff, { kitId: id, status: "published" })).toBe(0);
    const notices = await Notification.find({ type: "family", title: /kit is ready/ });
    expect(notices.map((n) => String(n.userId)).sort()).toEqual([parent, partner].sort());
    expect(notices[0].title).toBe("Aarav’s Class 5 kit is ready");
    expect(await kits.kitSchools()).toEqual(["St. Mary's"]);
  });

  it("buys the kit into the basket, capped at stock and skipping what is withdrawn", async () => {
    const id = await kits.saveKit(staff, kit());
    await expect(kits.kitToBasket(parent, await aarav())).rejects.toThrow("not available yet");
    await kits.setKitStatus(staff, { kitId: id, status: "published" });
    const [info] = await kits.childKits((await family.familyOf(parent))!);
    expect(info.kit).toMatchObject({ lines: 2, totalPaise: 25000, unavailable: 1 });
    expect(await kits.kitToBasket(partner, await aarav())).toEqual({ added: 2, skipped: 1 });
    const lines = await CartLine.find({ customerId: partner });
    expect(Object.fromEntries(lines.map((l) => [String(l.variantId), l.quantity]))).toEqual({ [pen]: 2, [pencil]: 1 });
    await expect(kits.kitToBasket(other, await aarav())).rejects.toThrow("not in your family");
  });

  it("asks about the next class once the school's newer year is out", async () => {
    await kits.setKitStatus(staff, { kitId: await kits.saveKit(staff, kit()), status: "published" });
    let [info] = await kits.childKits((await family.familyOf(parent))!);
    expect(info.next).toBeNull();
    await kits.setKitStatus(staff, { kitId: await kits.saveKit(staff, kit({ className: "6", year: nextYear })), status: "published" });
    [info] = await kits.childKits((await family.familyOf(parent))!);
    expect(info.next).toEqual({ year: nextYear, className: "6" });
    await expect(kits.promoteChild(other, { childId: await aarav(), year: nextYear, moved: "yes" })).rejects.toThrow("not in your family");
    await kits.promoteChild(partner, { childId: await aarav(), year: nextYear, moved: "yes" });
    const [child, sister] = (await family.familyOf(parent))!.children;
    expect(child).toMatchObject({ className: "6", year: nextYear });
    await expect(kits.promoteChild(parent, { childId: await aarav(), year: nextYear, moved: "no" })).rejects.toThrow("already set");
    await kits.promoteChild(parent, { childId: String(sister._id), year: nextYear, moved: "no" });
    expect((await family.familyOf(parent))!.children[1]).toMatchObject({ className: "2", year: nextYear });
    [info] = await kits.childKits((await family.familyOf(parent))!);
    expect(info.kit).toMatchObject({ lines: 2 });
  });
});
