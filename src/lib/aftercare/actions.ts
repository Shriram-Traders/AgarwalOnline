"use server";
import { requirePermission } from "../auth/session";
import { revalidatePath } from "next/cache";
import type { MutationState } from "../commerce/actions";
import { createComplaint, resolveComplaint, updateReturn } from "./service";
import { ZodError } from "zod";
import { plainMessage } from "../form-errors";
export async function aftercareAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    const operation = form.get("operation");
    if (operation === "create")
      await createComplaint(user.id, {
        ...Object.fromEntries(form),
        requestReturn: form.get("requestReturn") === "on",
      });
    else if (operation === "resolve")
      await resolveComplaint(user.id, Object.fromEntries(form));
    else if (operation === "return")
      await updateReturn(user.id, Object.fromEntries(form));
    else throw Error("Invalid operation");
    revalidatePath("/account/complaints");
    revalidatePath("/admin/complaints");
    return { success: "Your update has been saved." };
  } catch (e) {
    if (e instanceof ZodError) return { error: plainMessage(e) };
    const message = e instanceof Error ? e.message : "";
    return {
      error: /^(Item complaints|This complaint|Choose the|This return)/.test(
        message,
      )
        ? message
        : "Unable to save. Check the details and try again.",
    };
  }
}
