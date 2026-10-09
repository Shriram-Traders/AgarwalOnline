import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog } from "../db/models";
import { addLinesToBasket, objectId } from "../commerce/service";
import { actor } from "../operations/service";
import { notify } from "../engagement/service";
import { ShoppingList } from "../lists/models";
import { describeItems } from "../lists/service";
import { CLASSES, Family, SCHOOL_COLLATION, SchoolKit, classLabel } from "./models";

const year = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Write the year like 2026-27.")
  .refine((value) => (Number(value.slice(0, 4)) + 1) % 100 === Number(value.slice(5)), "Write the year like 2026-27.");
const kitInput = z.object({
  kitId: z.union([objectId, z.literal("")]).default(""),
  school: z.string().trim().min(2, "Give the school’s name.").max(80, "Keep the school name under 80 characters."),
  className: z.enum(CLASSES, { error: "Pick the class." }),
  year,
  boardId: z.union([objectId, z.literal("")]).default(""),
});
const duplicate = (e: unknown) => (e as { code?: number } | null)?.code === 11000;
const sameSchool = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) === 0;

/**
 * Staff build a kit's list on one of their own boards (Save on any product page), then copy it here.
 * Editing a kit without picking a board keeps its items.
 */
export async function saveKit(actorId: string, input: unknown) {
  const { kitId, boardId, ...fields } = kitInput.parse(input);
  await actor(actorId, "catalog:write");
  let items;
  if (boardId) {
    const board = await ShoppingList.findOne({ _id: boardId, ownerId: actorId, kind: "board" });
    if (!board) throw Error("Pick one of your own boards.");
    if (!board.items.length) throw Error("That board is empty. Save the kit’s items to it first.");
    items = board.items.map((item: { variantId: unknown; quantity: number }) => ({ variantId: item.variantId, quantity: item.quantity }));
  }
  if (!kitId && !items) throw Error("Pick the board to copy the items from.");
  let id = kitId;
  try {
    if (kitId) {
      const result = await SchoolKit.updateOne(
        { _id: kitId },
        { $set: { ...fields, updatedBy: actorId, ...(items ? { items } : {}) } },
        { runValidators: true },
      );
      if (!result.matchedCount) throw Error("This kit no longer exists.");
    } else id = String((await SchoolKit.create({ ...fields, items, updatedBy: actorId }))._id);
  } catch (e) {
    if (duplicate(e)) throw Error("There is already a kit for this school, class and year.");
    throw e;
  }
  await AuditLog.create({ actorId, action: "kit.save", target: id, details: { ...fields, lines: items?.length } });
  return id;
}

/** Publishing tells the parents of every matching child, once: republishing after a pause says nothing new. */
export async function setKitStatus(actorId: string, input: unknown) {
  const { kitId, status } = z.object({ kitId: objectId, status: z.enum(["draft", "published"]) }).parse(input);
  await actor(actorId, "catalog:write");
  if (status === "draft") {
    const result = await SchoolKit.updateOne({ _id: kitId, status: "published" }, { $set: { status, updatedBy: actorId } });
    if (!result.matchedCount) throw Error("This kit is not published.");
    await AuditLog.create({ actorId, action: "kit.unpublish", target: kitId });
    return 0;
  }
  const before = await SchoolKit.findOneAndUpdate(
    { _id: kitId, status: "draft", "items.0": { $exists: true } },
    { $set: { status, updatedBy: actorId } },
    { returnDocument: "before" },
  );
  if (!before) throw Error("This kit is already published, or has no items yet.");
  await AuditLog.create({ actorId, action: "kit.publish", target: kitId });
  if (before.publishedAt) return 0;
  await SchoolKit.updateOne({ _id: kitId }, { $set: { publishedAt: new Date() } });
  const families = await Family.find({
    children: { $elemMatch: { school: before.school, className: before.className, year: before.year } },
  }).collation(SCHOOL_COLLATION);
  let told = 0;
  for (const family of families)
    for (const child of family.children)
      if (sameSchool(child.school, before.school) && child.className === before.className && child.year === before.year)
        for (const adult of family.adults) {
          await notify({
            userId: adult,
            type: "family",
            title: `${child.name}’s ${classLabel(before.className)} kit is ready`,
            body: `${before.school} · ${before.items.length} item${before.items.length === 1 ? "" : "s"}. Buy it in one tap.`,
            href: "/account/family#kids",
          });
          told++;
        }
  return told;
}

/** Schools that have a published kit, for the school box on a child's form. */
export async function kitSchools() {
  await connectDB();
  const schools: string[] = await SchoolKit.distinct("school", { status: "published" });
  return schools.sort((a, b) => a.localeCompare(b));
}

type KitChild = { _id: unknown; name: string; school: string; className: string; year: string };

/** For each child: their kit this year with its total, and whether the school has a newer year's kits. */
export async function childKits(family: { children: KitChild[] }) {
  await connectDB();
  return Promise.all(
    family.children.map(async (child) => {
      if (!child.school) return { childId: String(child._id), kit: null, next: null };
      const [kit, newer] = await Promise.all([
        SchoolKit.findOne({ school: child.school, className: child.className, year: child.year, status: "published" }).collation(
          SCHOOL_COLLATION,
        ),
        SchoolKit.findOne({ school: child.school, status: "published", year: { $gt: child.year } })
          .sort({ year: 1 })
          .collation(SCHOOL_COLLATION)
          .select("year"),
      ]);
      const rows = kit ? await describeItems(kit.items) : [];
      const index = CLASSES.indexOf(child.className as (typeof CLASSES)[number]);
      return {
        childId: String(child._id),
        kit: kit
          ? {
              lines: rows.length,
              totalPaise: rows.reduce((sum, row) => sum + row.pricePaise * row.quantity, 0),
              unavailable: rows.filter((row) => row.available < row.quantity).length,
              images: rows.slice(0, 3).map((row) => ({ image: row.image, slug: row.slug })),
            }
          : null,
        // "Is Aarav going into Class 6 for 2027-28?" once the school's next year is out
        next: newer && index >= 0 && index < CLASSES.length - 1 ? { year: newer.year as string, className: CLASSES[index + 1] } : null,
      };
    }),
  );
}

/** Buy kit: the child's current kit into the basket, capped at stock like any other list. */
export async function kitToBasket(userId: string, childInput: unknown) {
  const childId = objectId.parse(childInput);
  await connectDB();
  const family = await Family.findOne({ adults: userId, "children._id": childId });
  const child = family?.children.find((c: { _id: unknown }) => String(c._id) === childId);
  if (!child) throw Error("This child is not in your family.");
  const kit = await SchoolKit.findOne({
    school: child.school,
    className: child.className,
    year: child.year,
    status: "published",
  }).collation(SCHOOL_COLLATION);
  if (!kit) throw Error("This kit is not available yet.");
  return addLinesToBasket(userId, kit.items);
}

/** The yearly question: moved up a class, or staying, for the school's newer year. */
export async function promoteChild(userId: string, input: unknown) {
  const data = z.object({ childId: objectId, year, moved: z.enum(["yes", "no"]) }).parse(input);
  await connectDB();
  const family = await Family.findOne({ adults: userId, "children._id": data.childId });
  const child = family?.children.find((c: { _id: unknown }) => String(c._id) === data.childId);
  if (!child) throw Error("This child is not in your family.");
  if (data.year <= child.year) throw Error("This school year is already set.");
  const index = CLASSES.indexOf(child.className);
  const className = data.moved === "yes" ? CLASSES[Math.min(index + 1, CLASSES.length - 1)] : child.className;
  await Family.updateOne(
    { _id: family._id, "children._id": data.childId },
    { $set: { "children.$.className": className, "children.$.year": data.year } },
    { runValidators: true },
  );
}
