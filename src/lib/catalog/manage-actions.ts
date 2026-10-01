"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import {
  saveCategory,
  setProductVisibility,
  updateProductMetadata,
  updateVariant,
} from "./manage";
import { formWithPaise } from "../display";
import { plainMessage } from "../form-errors";
import { log } from "../logger";

const SAVED = {
  category: "Aisle saved.",
  product: "Product details saved.",
  visibility: "",
  pack: "Pack saved.",
};
export async function catalogManagementAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("catalog:write");
    // new pack sizes go through governanceAction (operation "variant"), like other price changes
    const operation = z
      .enum(["category", "product", "visibility", "pack"])
      .parse(form.get("operation"));
    const raw = formWithPaise(form);
    if (operation === "category") await saveCategory(user.id, raw);
    else if (operation === "product")
      await updateProductMetadata(user.id, {
        ...raw,
        featured: form.get("featured") === "on",
        bestseller: form.get("bestseller") === "on",
      });
    else if (operation === "visibility") await setProductVisibility(user.id, raw);
    else await updateVariant(user.id, { ...raw, active: form.get("active") === "on" });
    revalidatePath("/admin/products", "layout");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/inventory");
    revalidatePath("/", "layout");
    return {
      success:
        operation === "visibility"
          ? form.get("visible") === "show"
            ? "The product is in the shop again."
            : "The product is hidden from the shop. You can show it again any time."
          : SAVED[operation],
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (/^(A category|Parent|Category|Product|Pack not found|Price)/.test(message)) return { error: message };
    if (/duplicate key/i.test(message))
      return { error: "That web address or SKU is already in use. Pick another one." };
    log("error", "catalog.unexpected-error", { error });
    return { error: "Unable to save the catalog change." };
  }
}
