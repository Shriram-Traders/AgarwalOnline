"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
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
  cancelByStore,
  retryDelivery,
  returnToShop,
  changeRider,
  removeRider,
  type PackingResult,
} from "./service";
import { hasPermission } from "../auth/permissions";
import { NONE_LEFT } from "./packing";
import { formatPrice, paiseFromRupees } from "../display";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
/** "A", "A and B", "A, B and C" */
const andList = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
/**
 * Who gives back money paid online for items that weren't packed, said to whoever saved. Only the
 * owner can, so a packer isn't left to pass it on: the owner is sent a message when what is owed
 * changes, and the order sits on their work queue until the refund is made.
 */
function refundNote(result: PackingResult, canRefund: boolean) {
  const owed = formatPrice(result.shortfallPaise ?? 0);
  if (canRefund) return `They paid online: refund the ${owed} from the Refunds page.`;
  return `They paid online, so the owner refunds the ${owed} from the Refunds page${
    result.ownersTold ? ", and has been told" : "; it is on their work queue"
  }.`;
}
/**
 * Units the shelf didn't have go back on sale when packing frees them, and a substitute's own
 * stock isn't taken down, so both counts need a person to put them right on the Stock page.
 */
function stockNote({ recount, substitutes }: PackingResult) {
  return [
    recount.length
      ? `Check the stock count for ${andList(recount)}: the shelf had fewer than it shows. Fix it on the Stock page.`
      : "",
    substitutes.length
      ? `Take ${andList(substitutes)} off ${substitutes.length === 1 ? "its" : "their"} stock count too, as ${substitutes.length === 1 ? "it" : "they"} went in instead.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
/** What a saved checklist did, in a line under the Save button. */
function packingSaved(result: PackingResult, canRefund: boolean) {
  if (!result.complete)
    return `Saved, but not finished: ${result.waiting.join("; ")}. For each, tick “${NONE_LEFT}” or name the substitute.`;
  if (!result.changed) return "Packing checklist saved.";
  const said = !result.charged
    ? result.shortfallPaise
      ? `Saved, and the customer has been told what changed. ${refundNote(result, canRefund)}`
      : "Saved, and the customer has been told what changed."
    : result.originalTotalPaise
      ? `Saved. The bill is now ${formatPrice(result.totalPaise)} (was ${formatPrice(result.originalTotalPaise)}), and the customer has been told.`
      : "Saved, and the customer has been told what changed.";
  const stock = stockNote(result);
  return stock ? `${said} ${stock}` : said;
}
export async function operationAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let delivered = false;
  // where the order page opens after a step whose panel goes away with it (and its message too)
  let landing: string | null = null;
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
        "cancel",
        "retry-delivery",
        "return-to-shop",
        "change-rider",
        "remove-rider",
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
          .map(([key, value]) => {
            const variantId = key.slice(7);
            // blank: all of the rest went in as the substitute
            const swapped = String(form.get(`substitutes_${variantId}`) ?? "").trim();
            return {
              variantId,
              // an empty box is not a count of none
              packedQuantity: String(value).trim() ? Number(value) : undefined,
              missing: form.get(`missing_${variantId}`) === "on",
              substitution: form.get(`substitution_${variantId}`) ?? "",
              substituteQuantity: swapped ? Number(swapped) : undefined,
            };
          });
        success = packingSaved(
          await savePacking(user.id, { orderId, items }),
          hasPermission(user.roles, "refund:write"),
        );
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
      // the note at the top of the order says what happened and what is left to do
      case "cancel":
        await cancelByStore(user.id, {
          orderId,
          reason: form.get("reason") ?? "",
        });
        landing = `/admin/orders/${orderId}#order-closed`;
        break;
      case "return-to-shop":
        await returnToShop(user.id, { orderId });
        landing = `/admin/orders/${orderId}#order-closed`;
        break;
      // back in "Packed, no rider": the assign step says why and takes the next rider
      case "retry-delivery":
        await retryDelivery(user.id, { orderId });
        landing = `/admin/orders/${orderId}#assign-rider`;
        break;
      case "remove-rider":
        await removeRider(user.id, { orderId });
        landing = `/admin/orders/${orderId}#assign-rider`;
        break;
      case "change-rider":
        await changeRider(user.id, {
          orderId,
          partnerId: form.get("partnerId"),
        });
        success = "Rider changed.";
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
    if (
      /^(This|Select|Complete|Confirm|Check |Packed|Nothing is packed|Delivery must|Enter the|A delivery|SMS delivery|Unable to send|The collected|Invalid or expired|Delivery code|Explain)/.test(
        message,
      )
    )
      return { error: message };
    // the permission checks' codes, said plainly
    if (message === "UNAUTHENTICATED") return { error: "Please sign in again to continue." };
    if (message === "FORBIDDEN") return { error: "Your account can’t do this. Ask the owner if you need it." };
    // staff see a plain sentence; the real cause goes to the server log
    log("error", "operations.unexpected-error", { error });
    return { error: "Unable to complete this operation. Please refresh and try again." };
  }
  if (delivered) redirect("/delivery");
  // replace: Back should leave the order, not show the same order again
  if (landing) redirect(landing, RedirectType.replace);
  return result;
}
