"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import {
  submitProduct,
  submitVariant,
  requestPrice,
  adjustStock,
  reviewApproval,
  withdrawRequest,
} from "./service";
import { formWithPaise } from "../display";
import { ZodError } from "zod";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
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
    let success: string;
    if (operation === "product") {
      // unticked boxes send nothing, so read them here rather than let a default stand in
      const { live } = await submitProduct(user.id, {
        ...data,
        showToCustomers: form.get("showToCustomers") === "on",
        showToSchools: form.get("showToSchools") === "on",
      });
      success = live ? "Product added. It is in the shop now." : "Request sent. The product goes live once an owner approves it.";
    } else if (operation === "variant") {
      const { live } = await submitVariant(user.id, data);
      success = live ? "Pack size added. Shoppers can buy it now." : "Request sent. The pack size goes live once an owner approves it.";
    } else if (operation === "price") {
      const { live } = await requestPrice(user.id, data);
      success = live ? "Price changed. Shoppers see it now." : "Request sent. The new price goes live once an owner approves it.";
    } else if (operation === "stock") {
      const { outcome } = await adjustStock(user.id, data);
      success =
        outcome === "applied"
          ? "Stock updated."
          : "This is a large change, so it was sent to an owner for approval.";
    } else if (operation === "review") {
      await reviewApproval(user.id, data);
      success = "Decision saved.";
    } else if (operation === "withdraw") {
      await withdrawRequest(user.id, form.get("requestId"));
      success = "Request withdrawn.";
    } else throw Error("Invalid operation");
    revalidatePath("/admin/products", "layout");
    revalidatePath("/admin/inventory");
    revalidatePath("/super-admin/approvals");
    revalidatePath("/catalog");
    revalidatePath("/");
    return { success };
  } catch (e) {
    if (e instanceof ZodError) return { error: plainMessage(e) };
    const message = e instanceof Error ? e.message : "";
    if (
      /^(You cannot|A rejection|This request|Prices changed|Stock changed|This adjustment|A (price|stock) change|That (web address|SKU)|Only the person|Only an owner|Product not found|Select a category|Price must|Tick)/.test(
        message,
      )
    )
      return { error: message };
    log("error", "governance.unexpected-error", { error: e });
    return { error: "Unable to save. Check the values and try again." };
  }
}
