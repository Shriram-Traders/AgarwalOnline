"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { createRefund, processRefund } from "./service";
import { formWithPaise } from "../display";
import { ZodError } from "zod";
import { plainMessage } from "../form-errors";

export async function refundAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("refund:write");
    const operation = form.get("operation");
    if (operation === "create")
      await createRefund(user.id, formWithPaise(form));
    else if (operation === "process")
      await processRefund(user.id, Object.fromEntries(form));
    else throw Error("Invalid refund operation.");
    revalidatePath("/super-admin/refunds");
    revalidatePath("/super-admin");
    revalidatePath("/account/notifications");
    return {
      success:
        operation === "create" ? "Refund request created." : "Refund updated.",
    };
  } catch (error) {
    if (error instanceof ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    return {
      error:
        /^(Only paid|Refund amount|This refund|Enter the|The captured|Razorpay)/.test(
          message,
        )
          ? message
          : "Unable to update this refund.",
    };
  }
}
