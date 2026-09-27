"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import {
  changeOrderStatus,
  savePacking,
  assignDelivery,
  partnerTransition,
  requestDeliveryOTP,
  completeDelivery,
  reconcileCOD,
  resolveCODDiscrepancy,
} from "./service";
import { paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";
export async function operationAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let delivered = false;
  let result: MutationState = {};
  try {
    const user = await requirePermission("profile:own");
    const operation = z
      .enum([
        "status",
        "packing",
        "assign",
        "delivery-status",
        "delivery-otp",
        "deliver",
        "reconcile",
        "resolve-discrepancy",
      ])
      .parse(form.get("operation"));
    const orderId = form.get("orderId");
    let success = "Saved successfully.";
    switch (operation) {
      case "status":
        await changeOrderStatus(user.id, {
          orderId,
          dimension: form.get("dimension"),
          next: form.get("next"),
        });
        break;
      case "packing": {
        const items = [...form.entries()]
          .filter(([key]) => key.startsWith("packed_"))
          .map(([key, value]) => ({
            variantId: key.slice(7),
            packedQuantity: Number(value),
            missing: form.get(`missing_${key.slice(7)}`) === "on",
            substitution: form.get(`substitution_${key.slice(7)}`) ?? "",
          }));
        await savePacking(user.id, { orderId, items });
        break;
      }
      case "assign":
        await assignDelivery(user.id, {
          orderId,
          partnerId: form.get("partnerId"),
        });
        break;
      case "delivery-status":
        await partnerTransition(user.id, {
          orderId,
          next: form.get("next"),
          reason: form.get("reason") ?? "",
        });
        break;
      case "delivery-otp":
        success = await requestDeliveryOTP(user.id, orderId);
        break;
      case "deliver":
        await completeDelivery(user.id, {
          orderId,
          code: form.get("code"),
          cashPaise: paiseFromRupees(form.get("cashRupees")) ?? null,
        });
        break;
      case "reconcile":
        await reconcileCOD(user.id, {
          orderId,
          receivedPaise: paiseFromRupees(form.get("receivedRupees")) ?? null,
          note: form.get("note") ?? "",
        });
        break;
      case "resolve-discrepancy":
        await resolveCODDiscrepancy(user.id, {
          orderId,
          resolution: form.get("resolution") ?? "",
        });
        break;
    }
    for (const path of [
      "/admin",
      "/delivery",
      `/admin/orders/${orderId}`,
      `/delivery/orders/${orderId}`,
      `/account/orders/${orderId}`,
    ])
      revalidatePath(path);
    delivered = operation === "deliver";
    result = { success };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    return {
      error:
        /^(This|Select|Complete|Confirm|Check every|Packed|Delivery must|Enter the|A delivery|SMS delivery|Unable to send|The collected|Invalid or expired|Delivery code|Explain)/.test(
          message,
        )
          ? message
          : "Unable to complete this operation. Please refresh and try again.",
    };
  }
  if (delivered) redirect("/delivery");
  return result;
}
