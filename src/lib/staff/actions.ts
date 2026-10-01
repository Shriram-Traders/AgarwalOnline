"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { createStaff, grantStaffRole, updateStaff } from "./service";
import { plainMessage } from "../form-errors";

export async function staffAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let granted = "";
  try {
    const actor = await requirePermission("staff:manage");
    const operation = String(form.get("operation"));
    const input = {
      ...Object.fromEntries(form),
      active: form.get("active") === "on",
    };
    let success = "Staff account updated.";
    if (operation === "create")
      success = (await createStaff(actor.id, input)).created
        ? "Staff account created."
        : "Staff access added to the existing account.";
    else if (operation === "grant") {
      await grantStaffRole(actor.id, input);
      granted = String(form.get("userId"));
    }
    else if (operation === "update") {
      const { released } = await updateStaff(actor.id, input);
      if (released)
        success = `Staff account updated. ${released} delivery${released === 1 ? " is" : " orders are"} back in “Packed, no rider” for someone else to take.`;
    } else throw Error("Invalid operation.");
    revalidatePath("/super-admin/staff");
    revalidatePath("/super-admin/audit");
    revalidatePath("/super-admin");
    if (!granted) return { success };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (/^(Manage your|Keep at least|Staff account|Name, work|This rider has|Enter a 10-digit)/.test(message))
      return { error: message };
    if (/duplicate key/i.test(message))
      return { error: "That email or phone number is already in use." };
    return { error: "Unable to save this staff account." };
  }
  // the picked person leaves the candidate list, so the confirmation lives on the page
  redirect(`/super-admin/staff?added=${granted}#team`);
}
