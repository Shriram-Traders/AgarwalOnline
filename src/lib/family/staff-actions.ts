"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { saveKit, setKitStatus } from "./kits";
import { decideTab, recordTabPayment, voidTabPayment } from "./tab";
import { formWithPaise } from "../display";

function errorMessage(e: unknown) {
  if (e instanceof z.ZodError) return plainMessage(e);
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHENTICATED" || message === "FORBIDDEN") return "You don’t have access to school kits.";
  if (/^(This|That|There|Pick|Give|Keep|Write|A kit|Set|Enter|Say)/.test(message)) return message;
  log("error", "kits.unexpected-error", { error: e });
  return "Unable to save. Please try again.";
}

/** School kits, for catalog staff: save one from a board, publish or pause it. */
export async function kitAction(_state: MutationState, form: FormData): Promise<MutationState> {
  let next: string | null = null;
  let success = "Saved.";
  try {
    const user = await requirePermission("catalog:write");
    if (form.get("intent") === "status") {
      const told = await setKitStatus(user.id, { kitId: form.get("kitId"), status: form.get("status") });
      success =
        form.get("status") === "published"
          ? `Published. ${told ? `${told} parent${told === 1 ? " was" : "s were"} told.` : "No parent had to be told."}`
          : "Kit paused. Parents no longer see it.";
    } else {
      const id = await saveKit(user.id, {
        kitId: form.get("kitId") ?? "",
        school: form.get("school"),
        className: form.get("className"),
        year: form.get("year"),
        boardId: form.get("boardId") ?? "",
      });
      if (!form.get("kitId")) next = `/admin/kits?edit=${id}#edit`;
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/kits");
  revalidatePath("/account/family");
  if (next) redirect(next);
  return { success };
}

/** Family tabs: staff who handle cash record payments; the owner opens, limits, pauses, closes and voids. */
export async function tabAction(_state: MutationState, form: FormData): Promise<MutationState> {
  let success = "Saved.";
  try {
    const intent = form.get("intent");
    const fields = formWithPaise(form);
    if (intent === "payment") {
      const user = await requirePermission("cod:reconcile");
      const remaining = await recordTabPayment(user.id, fields);
      success = remaining > 0 ? `Payment recorded. ₹${remaining / 100} is still owed.` : "Payment recorded. Nothing is owed now.";
    } else if (intent === "void") {
      const user = await requirePermission("tab:approve");
      await voidTabPayment(user.id, fields);
      success = "Payment voided. The family was told.";
    } else {
      const user = await requirePermission("tab:approve");
      await decideTab(user.id, fields);
      success = "Saved. The family was told.";
    }
  } catch (e) {
    return { error: errorMessage(e).replace("school kits", "family tabs") };
  }
  revalidatePath("/admin/tabs");
  return { success };
}
