"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import {
  submitProduct,
  requestPrice,
  adjustStock,
  reviewApproval,
} from "./service";
import { formWithPaise } from "../display";
import { ZodError } from "zod";
import { plainMessage } from "../form-errors";
export async function governanceAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    const operation = String(form.get("operation"));
    const data = formWithPaise(form);
    // a publish time from datetime-local is the store's IST wall time with no zone
    if (typeof data.scheduledAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.scheduledAt))
      data.scheduledAt = `${data.scheduledAt}:00+05:30`;
    if (operation === "product") await submitProduct(user.id, data);
    else if (operation === "price") await requestPrice(user.id, data);
    else if (operation === "stock") await adjustStock(user.id, data);
    else if (operation === "review") await reviewApproval(user.id, data);
    else throw Error("Invalid operation");
    revalidatePath("/admin/products");
    revalidatePath("/admin/inventory");
    revalidatePath("/super-admin/approvals");
    revalidatePath("/catalog");
    revalidatePath("/");
    return {
      success:
        operation === "review"
          ? "Review saved."
          : operation === "stock"
            ? "Stock adjustment recorded or sent for approval."
            : "Request sent for approval.",
    };
  } catch (e) {
    if (e instanceof ZodError) return { error: plainMessage(e) };
    const message = e instanceof Error ? e.message : "";
    return {
      error:
        /^(You cannot|A rejection|This request|Prices changed|Stock changed|This adjustment)/.test(
          message,
        )
          ? message
          : "Unable to save. Check the values, duplicate requests and your permissions.",
    };
  }
}
