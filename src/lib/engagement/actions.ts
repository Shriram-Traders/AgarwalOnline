"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { markNotification, toggleWishlist } from "./service";

export async function wishlistAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  try {
    const saved = await toggleWishlist(user.id, form.get("productId"));
    revalidatePath("/", "layout");
    revalidatePath("/account/wishlist");
    return { success: saved ? "Saved" : "Removed", saved };
  } catch {
    return { error: "Unable to update your wishlist." };
  }
}

export async function notificationAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    await markNotification(user.id, {
      notificationId: form.get("notificationId") || undefined,
    });
    // the header bell and the You tab carry the unread count on every page
    revalidatePath("/", "layout");
    return { success: "Notifications updated." };
  } catch {
    return { error: "Unable to update notifications." };
  }
}
