"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { log } from "../logger";
import { BILL_STYLES, SECTION_KEYS, saveBillStyle, saveShopSettings, type SectionKey } from "./shop";

const SAVED: Record<SectionKey, string> = {
  bill: "Bill settings saved. Every bill opened from now on uses them.",
  slip: "Packing slip settings saved.",
  quotation: "Quotation settings saved. Quotations sent from now on use them.",
  storefront: "Shop front saved. Shoppers see it within a minute.",
  messages: "Customer messages saved. They go out from the next order update.",
  numbers: "Numbering saved. New orders and quotations use it.",
  defaults: "Defaults saved. New packs, areas, delivery times and offers start from them.",
  queues: "Work queue timings saved.",
};

/** Customize: an owner saves one section (the form's hidden `section` field says which). */
export async function customizeAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const section = z.enum(SECTION_KEYS as [SectionKey, ...SectionKey[]]).parse(form.get("section"));
    await saveShopSettings(user.id, section, form);
    // the shop front sits on every page; the rest show on a handful, all rendered per request
    revalidatePath("/", "layout");
    return { success: SAVED[section] };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Check the values and try again." };
    log("error", "customize.unexpected-error", { error: e });
    return { error: "Unable to save. Check the values and try again." };
  }
}

/** Customize → Bills: "Use this style" on one of the bill previews. */
export async function billStyleAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const style = await saveBillStyle(user.id, form.get("style"));
    revalidatePath("/super-admin/customize");
    const name = BILL_STYLES.find((option) => option.value === style)?.label.replace(/\s*\(.*\)$/, "") ?? style;
    return { success: `Bills now print in the ${name} style.` };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Pick one of the bill styles." };
    log("error", "customize.bill-style-error", { error: e });
    return { error: "Unable to save. Try again." };
  }
}
