"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { createVariant, saveCategory, updateProductMetadata } from "./manage";
import { formWithPaise } from "../display";
import { plainMessage } from "../form-errors";

export async function catalogManagementAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("catalog:write");
    const operation = z
      .enum(["category", "product", "variant"])
      .parse(form.get("operation"));
    const raw = formWithPaise(form);
    if (operation === "category") await saveCategory(user.id, raw);
    else if (operation === "product")
      await updateProductMetadata(user.id, {
        ...raw,
        featured: form.get("featured") === "on",
        bestseller: form.get("bestseller") === "on",
        published: form.get("published") === "on",
      });
    else await createVariant(user.id, raw);
    revalidatePath("/admin/products");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/inventory");
    revalidatePath("/catalog");
    revalidatePath("/");
    return {
      success: `${operation[0].toUpperCase()}${operation.slice(1)} saved.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    return {
      error:
        /^(A category|Parent|Category|Product|A draft|Add variants|Price)/.test(
          message,
        )
          ? message
          : /duplicate key/i.test(message)
            ? "That slug or SKU is already in use."
            : "Unable to save the catalog change.",
    };
  }
}
