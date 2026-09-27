"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUser, requirePermission } from "../auth/session";
import { Address } from "./models";
import { ServiceArea } from "../db/models";
import {
  setCartLine,
  objectId,
  checkout,
  cancelOrder,
  reorder,
} from "./service";
import { plainMessage } from "../form-errors";
import { sendClaimCode } from "../auth/claim";
export type MutationState = {
  error?: string;
  success?: string;
  saved?: boolean;
};
function errorMessage(e: unknown) {
  if (e instanceof z.ZodError) return plainMessage(e);
  const message = e instanceof Error ? e.message : "";
  return /^(Select|Cash|This|Your|Too many basket|A basket|Insufficient|Order exceeds|UNAUTHENTICATED|FORBIDDEN)/.test(
    message,
  )
    ? message
    : "Unable to save. Please try again.";
}
export async function cartAction(
  state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const result = await quickAddAction(state, form);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}
export async function addressAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let verifySignInNumber = false;
  try {
    const user = await requirePermission("order:own");
    const operation = z
      .enum(["create", "update", "delete"])
      .catch("create")
      .parse(form.get("operation"));
    const addressId = form.get("addressId")
      ? objectId.parse(form.get("addressId"))
      : undefined;
    if (operation === "delete") {
      if (!addressId) throw Error("This address is unavailable.");
      const deleted = await Address.deleteOne({
        _id: addressId,
        customerId: user.id,
      });
      if (!deleted.deletedCount) throw Error("This address is unavailable.");
      revalidatePath("/account/addresses");
      return { success: "Address removed." };
    }
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().regex(/^[6-9]\d{9}$/),
        line: z.string().trim().min(8).max(250),
        pin: z.string().regex(/^\d{6}$/),
        areaId: objectId,
        instructions: z.string().max(300),
        isDefault: z.boolean().optional(),
      })
      .parse({ ...Object.fromEntries(form), isDefault: form.get("isDefault") === "on" });
    const area = await ServiceArea.findOne({
      _id: data.areaId,
      enabled: true,
      pincodes: data.pin,
    });
    if (!area)
      throw Error("This PIN code is not enabled for the selected area.");
    if (operation === "update") {
      if (!addressId) throw Error("This address is unavailable.");
      const updated = await Address.updateOne(
        { _id: addressId, customerId: user.id },
        { $set: data },
        { runValidators: true },
      );
      if (!updated.matchedCount) throw Error("This address is unavailable.");
      if (data.isDefault)
        await Address.updateMany(
          { customerId: user.id, _id: { $ne: addressId } },
          { $set: { isDefault: false } },
        );
    } else {
      if (data.isDefault)
        await Address.updateMany(
          { customerId: user.id },
          { $set: { isDefault: false } },
        );
      await Address.create({ ...data, customerId: user.id });
    }
    revalidatePath("/account/addresses");
    // "Also use this number to sign in": only offered to accounts without a sign-in number
    if (operation === "create" && form.get("useForSignIn") === "on" && !user.phone) {
      const sent = await sendClaimCode(user.id, data.phone);
      if ("error" in sent)
        return { success: "Address saved.", error: `We couldn’t use this number to sign in: ${sent.error}` };
      verifySignInNumber = true;
    }
    if (!verifySignInNumber)
      return {
        success: operation === "update" ? "Address updated." : "Address saved.",
      };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/account/addresses?verify=1");
}

export async function reorderAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    const result = await reorder(user.id, form.get("orderId"));
    revalidatePath("/", "layout");
    return {
      success: `${result.added} item${result.added === 1 ? "" : "s"} added to your basket${result.skipped ? ` · ${result.skipped} unavailable` : ""}.`,
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
export async function checkoutAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let id = "";
  try {
    const user = await requirePermission("order:own");
    id = await checkout(user.id, {
      addressId: form.get("addressId"),
      slotId: form.get("slotId"),
      idempotencyKey: form.get("idempotencyKey"),
      method: form.get("method"),
      promotionCode: (await cookies()).get("ags_promotion")?.value,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/account/orders/${id}`);
}
export async function cancelAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    await cancelOrder(user.id, form.get("orderId"));
    revalidatePath(`/account/orders/${form.get("orderId")}`);
    return { success: "Order cancelled. Reserved stock has been released." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
/** Sets a basket line without re-rendering the page: the basket provider already shows the change. */
export async function quickAddAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await currentUser();
    if (user)
      await setCartLine(user.id, form.get("variantId"), form.get("quantity"));
    else {
      const { setGuestCartLine } = await import("./guest-cart");
      await setGuestCartLine(form.get("variantId"), form.get("quantity"));
    }
    return { success: "Basket updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
