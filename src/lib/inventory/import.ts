import { z } from "zod";
import { connectDB } from "../db/connect";
import { InventoryItem, Product, ProductVariant, User } from "../db/models";
import { SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Role } from "../auth/permissions";
import { adjustStock } from "../governance/service";
import { headerPositions, parseCsv, toCsv } from "./csv";

/** The most rows one sheet may change, and the largest file read. */
export const MAX_ROWS = 500;
export const MAX_BYTES = 200 * 1024;

export type ImportRow = {
  /** The row's line in the sheet, counting the header as line 1. */
  line: number;
  sku: string;
  name?: string;
  label?: string;
  onHand?: number;
  delta?: number;
  after?: number;
  reason?: string;
  variantId?: string;
  /** apply: changes at once · approval: big enough to wait for an owner · same: nothing to change · error: see message */
  outcome: "apply" | "approval" | "same" | "error";
  message?: string;
};
export type ImportPlan = { rows: ImportRow[]; problem?: string };

async function actor(actorId: string) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(actorId), active: true }).select("roles");
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], "inventory:adjust");
}

/** The current stock as a sheet to fill in: a Count (what's on the shelf now) or a Change for each pack. */
export async function stockSheet(actorId: string) {
  await actor(actorId);
  const [variants, products, stock] = await Promise.all([
    ProductVariant.find({}).sort({ sku: 1 }).select("sku label productId active").lean<{ _id: unknown; sku: string; label: string; productId: unknown; active?: boolean }[]>(),
    Product.find({}).select("name").lean<{ _id: unknown; name: { en: string } }[]>(),
    InventoryItem.find({}).select("variantId onHand").lean<{ variantId: unknown; onHand: number }[]>(),
  ]);
  const productName = new Map(products.map((p) => [String(p._id), p.name.en]));
  const onHand = new Map(stock.map((s) => [String(s.variantId), s.onHand]));
  return toCsv([
    ["sku", "product", "pack", "on_shelf", "count", "change", "reason"],
    ...variants.map((v) => [v.sku, productName.get(String(v.productId)) ?? "", v.label, onHand.get(String(v._id)) ?? 0, "", "", ""]),
  ]);
}

const whole = (text: string) => (/^[+-]?\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

/**
 * Reads a filled-in sheet against today's stock, row by row, without changing anything: what each
 * row would do, which changes are big enough to wait for an owner, and which rows can't be used.
 */
export async function planStockImport(actorId: string, text: string, sharedReason = ""): Promise<ImportPlan> {
  await actor(actorId);
  if (text.length > MAX_BYTES) return { rows: [], problem: "That file is too big. Keep it under 200 KB (about 2,000 rows)." };
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], problem: "The sheet has no rows under its header." };
  const columns = headerPositions(table[0]);
  if (columns.sku === undefined) return { rows: [], problem: "The first row needs a “sku” column." };
  if (columns.count === undefined && columns.change === undefined)
    return { rows: [], problem: "The first row needs a “count” or a “change” column." };
  const body = table.slice(1);
  if (body.length > MAX_ROWS) return { rows: [], problem: `One sheet can change up to ${MAX_ROWS} packs. Split it into smaller sheets.` };

  const skus = [...new Set(body.map((cells) => (cells[columns.sku!] ?? "").trim()).filter(Boolean))];
  const [variants, setting] = await Promise.all([
    // SKUs match whatever their case in the sheet
    ProductVariant.find({ sku: { $in: skus } })
      .collation({ locale: "en", strength: 2 })
      .select("sku label productId").lean<{ _id: unknown; sku: string; label: string; productId: unknown }[]>(),
    SystemSetting.findOne({ key: "large-stock-threshold" }).lean<{ value?: unknown }>(),
  ]);
  const [products, stock] = await Promise.all([
    Product.find({ _id: { $in: variants.map((v) => v.productId) } }).select("name").lean<{ _id: unknown; name: { en: string } }[]>(),
    InventoryItem.find({ variantId: { $in: variants.map((v) => v._id) } }).select("variantId onHand").lean<{ variantId: unknown; onHand: number }[]>(),
  ]);
  const threshold = z.number().int().min(1).catch(100).parse(setting?.value ?? 100);
  const bySku = new Map(variants.map((v) => [v.sku.toLowerCase(), v]));
  const seen = new Set<string>();

  const rows = body.map((cells, index): ImportRow => {
    const line = index + 2;
    const sku = (cells[columns.sku!] ?? "").trim();
    const countText = columns.count === undefined ? "" : (cells[columns.count] ?? "").trim();
    const changeText = columns.change === undefined ? "" : (cells[columns.change] ?? "").trim();
    const reason = ((columns.reason === undefined ? "" : (cells[columns.reason] ?? "").trim()) || sharedReason.trim()).slice(0, 500);
    if (!sku) return { line, sku, outcome: "error", message: "No SKU." };
    if (!countText && !changeText) return { line, sku, outcome: "same", message: "Nothing filled in." };
    const variant = bySku.get(sku.toLowerCase());
    if (!variant) return { line, sku, outcome: "error", message: "No pack has this SKU." };
    const key = String(variant._id);
    if (seen.has(key)) return { line, sku, outcome: "error", message: "This SKU is already on an earlier row." };
    seen.add(key);
    const name = products.find((p) => String(p._id) === String(variant.productId))?.name.en;
    const onHand = stock.find((s) => String(s.variantId) === key)?.onHand;
    const base = { line, sku: variant.sku, name, label: variant.label, variantId: key, onHand, reason };
    if (onHand === undefined) return { ...base, outcome: "error", message: "This pack has no stock record." };
    if (countText && changeText) return { ...base, outcome: "error", message: "Fill Count or Change, not both." };
    const count = countText ? whole(countText) : NaN;
    const change = changeText ? whole(changeText) : NaN;
    if (countText && (!Number.isFinite(count) || count < 0)) return { ...base, outcome: "error", message: "Count must be a whole number, 0 or more." };
    if (changeText && !Number.isFinite(change)) return { ...base, outcome: "error", message: "Change must be a whole number, like 12 or -3." };
    const delta = countText ? count - onHand : change;
    if (Math.abs(delta) > 100000) return { ...base, outcome: "error", message: "That change is too large." };
    if (onHand + delta < 0) return { ...base, delta, outcome: "error", message: `Only ${onHand} on the shelf; it can’t go below 0.` };
    if (delta === 0) return { ...base, delta, after: onHand, outcome: "same", message: "Already this many." };
    if (reason.length < 5) return { ...base, delta, after: onHand + delta, outcome: "error", message: "Add a reason (5 letters or more), in the row or above the file." };
    return { ...base, delta, after: onHand + delta, outcome: Math.abs(delta) >= threshold ? "approval" : "apply" };
  });
  return { rows };
}

export type ImportResult = { applied: number; waiting: number; failed: { line: number; sku: string; message: string }[] };

/**
 * Applies a sheet: each usable row through the same stock change as the Stock page, so big changes
 * still wait for an owner and every change is in the audit trail. A row that fails doesn't stop
 * the rest. The sheet is read again first, so it's checked against stock as it is now.
 */
export async function applyStockImport(actorId: string, text: string, sharedReason = ""): Promise<ImportResult> {
  const plan = await planStockImport(actorId, text, sharedReason);
  if (plan.problem) throw Error(plan.problem);
  const result: ImportResult = { applied: 0, waiting: 0, failed: [] };
  for (const row of plan.rows) {
    if (row.outcome === "error") result.failed.push({ line: row.line, sku: row.sku, message: row.message ?? "Can’t be used." });
    if (row.outcome !== "apply" && row.outcome !== "approval") continue;
    try {
      const { outcome } = await adjustStock(actorId, { variantId: row.variantId, delta: row.delta, reason: row.reason });
      if (outcome === "applied") result.applied += 1;
      else result.waiting += 1;
    } catch (error) {
      result.failed.push({
        line: row.line,
        sku: row.sku,
        message: error instanceof z.ZodError ? "A value isn’t valid." : error instanceof Error ? error.message : "Couldn’t be saved.",
      });
    }
  }
  return result;
}
