"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import { log } from "../logger";
import { applyStockImport, planStockImport, type ImportPlan, type ImportResult } from "./import";

const input = z.object({ text: z.string().max(400_000), reason: z.string().max(500).default("") });

function message(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (text === "UNAUTHENTICATED") return "Please sign in again to continue.";
  if (text === "FORBIDDEN") return "Your account can’t change stock.";
  if (/^(That file|The sheet|The first row|One sheet)/.test(text)) return text;
  log("error", "inventory.import-error", { error });
  return "Couldn’t read the sheet. Please try again.";
}

/** Reads the sheet and says what each row would do; nothing changes yet. */
export async function previewStockImportAction(data: { text: string; reason: string }): Promise<ImportPlan & { error?: string }> {
  try {
    const user = await requirePermission("inventory:adjust");
    const { text, reason } = input.parse(data);
    return await planStockImport(user.id, text, reason);
  } catch (error) {
    return { rows: [], error: message(error) };
  }
}

/** Applies the sheet, row by row, through the Stock page's own change. */
export async function applyStockImportAction(data: { text: string; reason: string }): Promise<{ result?: ImportResult; error?: string }> {
  try {
    const user = await requirePermission("inventory:adjust");
    const { text, reason } = input.parse(data);
    const result = await applyStockImport(user.id, text, reason);
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/products", "layout");
    revalidatePath("/super-admin/approvals");
    revalidatePath("/", "layout");
    return { result };
  } catch (error) {
    return { error: message(error) };
  }
}
