"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { markNotification, toggleWishlist } from "./service";
import { setStockAlert } from "./stock-alerts";
import { returnPath } from "../return-path";
import { log } from "../logger";

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

/** "Tell me when it's back" on a sold-out pack, and "Don't tell me" to take it back. */
export async function stockAlertAction(_state: MutationState, form: FormData): Promise<MutationState> {
  const user = await currentUser();
  if (!user) {
    const back = returnPath(form.get("then"));
    redirect(back ? `/login?then=${encodeURIComponent(back)}` : "/login");
  }
  try {
    const on = await setStockAlert(user.id, form.get("variantId"), form.get("want") === "1");
    revalidatePath("/products/[slug]", "page");
    // the button's own line says "We'll tell you when it's back" now: this says how
    return { success: on ? "One notification when it’s back: in the bell, and on your phone if notifications are on." : "Okay, we won’t." };
  } catch (e) {
    const unavailable = e instanceof Error && e.message === "This product is unavailable.";
    if (!unavailable) log("warn", "stock-alert.set-failed", { error: e });
    return { error: unavailable ? "This product is unavailable." : "Couldn’t save that. Try again." };
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
