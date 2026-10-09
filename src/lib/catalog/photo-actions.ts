"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { storeEvidence } from "../evidence/service";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { saveProductPhotos } from "./manage";

/** What an upload gives back to the Photos panel: the photo's address, or why it didn't go. */
export type PhotoUploadState = { url?: string; error?: string };

function message(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return plainMessage(error);
  const text = error instanceof Error ? error.message : "";
  if (text === "UNAUTHENTICATED") return "Please sign in again to continue.";
  if (text === "FORBIDDEN") return "Your account can’t change product photos.";
  if (/^(Choose|Photographs|Use a|Image storage|Product|A product can have)/.test(text)) return text;
  log("error", "catalog.photo-error", { error });
  return fallback;
}
function refresh(productId?: string) {
  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  // cards, search, the basket and the product page all show the cover
  revalidatePath("/", "layout");
}

/**
 * One photo from the Photos panel. On Edit product it joins the product's list at once; on Add
 * product it waits as a draft until the product is sent for approval.
 */
export async function uploadProductPhotoAction(form: FormData): Promise<PhotoUploadState> {
  try {
    const user = await requirePermission("catalog:write");
    const purpose = z.enum(["product", "product-draft"]).parse(form.get("purpose"));
    const productId = purpose === "product" ? String(form.get("productId") ?? "") : undefined;
    const evidence = await storeEvidence(user.id, { file: form.get("file") as File, purpose, productId });
    if (purpose === "product") refresh(productId);
    return { url: evidence.url as string };
  } catch (error) {
    return { error: message(error, "Unable to upload this photo. Please try again.") };
  }
}

/** The panel's "Save photo order": the list as it now stands, first being the cover. */
export async function saveProductPhotosAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("catalog:write");
    const productId = String(form.get("productId") ?? "");
    await saveProductPhotos(user.id, { productId, images: form.getAll("images").map(String) });
    refresh(productId);
    return { success: "Photos saved." };
  } catch (error) {
    return { error: message(error, "Unable to save the photos. Please try again.") };
  }
}
