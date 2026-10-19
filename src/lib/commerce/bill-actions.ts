"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "./actions";
import { setBillTo, setShopNameOnBills } from "./bill";
import { plainMessage } from "../form-errors";
import { log } from "../logger";

/** The Bill card on a staff order page: who the bill is made out to, and (owners) the shop's name on bills. */
export async function billAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("order:manage");
    const orderId = String(form.get("orderId") ?? "");
    if (form.get("operation") === "shop-name") {
      await requirePermission("settings:write");
      await setShopNameOnBills(user.id, { legalName: form.get("legalName") });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/super-admin");
      return { success: "Shop name saved. Every bill from now on carries it; bills already given keep theirs." };
    }
    const { reissued, number } = await setBillTo(user.id, {
      orderId,
      name: form.get("name") ?? "",
      gstin: form.get("gstin") ?? "",
    });
    revalidatePath(`/admin/orders/${orderId}`);
    return {
      success: reissued
        ? `Saved. The bill was already given, so it is re-issued as bill ${number}, which says which bill it replaces.`
        : "Bill details saved.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (/^(Order not found|A cancelled order)/.test(message)) return { error: message };
    if (message === "FORBIDDEN") return { error: "Only an owner can change the shop's name on bills." };
    log("error", "bill.unexpected-error", { error });
    return { error: "Unable to save the bill details." };
  }
}
