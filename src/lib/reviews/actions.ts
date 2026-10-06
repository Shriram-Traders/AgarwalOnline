"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MutationState } from "../commerce/actions";
import { requirePermission } from "../auth/session";
import { objectId } from "../commerce/service";
import { ProductReview, ReviewReport } from "./models";
import { saveReview } from "./service";
import { AuditLog } from "../db/models";
import { plainMessage } from "../form-errors";

export async function reviewAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    const productId = objectId.parse(form.get("productId"));
    const rating = z.coerce.number().int().min(1).max(5).parse(form.get("rating"));
    const title = z.string().trim().max(80).parse(form.get("title") ?? "");
    const body = z.string().trim().max(1000).parse(form.get("body") ?? "");
    const status = await saveReview(user.id, { productId, rating, title, body });
    if (!status)
      return { error: "Reviews are available after this product is delivered." };
    revalidatePath(`/products/${form.get("slug")}`);
    // a review the shop hid stays hidden when its writer edits it
    return {
      success:
        status === "hidden"
          ? "Saved. The shop has hidden this review, so it isn’t shown on the product page."
          : "Your verified review is live.",
    };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? plainMessage(error)
          : "Unable to save your review.",
    };
  }
}

export async function reportReviewAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    const reviewId = objectId.parse(form.get("reviewId"));
    const reason = z.string().trim().min(5).max(300).parse(form.get("reason"));
    await ReviewReport.updateOne(
      { reviewId, reportedBy: user.id },
      { $setOnInsert: { reason, status: "open" } },
      { upsert: true, runValidators: true },
    );
    return { success: "Review reported for moderation." };
  } catch {
    return { error: "Unable to report this review." };
  }
}

export async function moderateReviewAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("review:moderate");
    const reviewId = objectId.parse(form.get("reviewId"));
    const status = z.enum(["published", "hidden"]).parse(form.get("status"));
    const reason = z.string().trim().min(3).max(300).parse(form.get("reason"));
    const review = await ProductReview.findByIdAndUpdate(
      reviewId,
      { $set: { status, moderatedBy: user.id, moderationReason: reason } },
      { new: true },
    );
    if (!review) return { error: "Review not found." };
    await ReviewReport.updateMany(
      { reviewId },
      { $set: { status: "resolved" } },
    );
    await AuditLog.create({
      actorId: user.id,
      action: `review.${status}`,
      target: reviewId,
      details: { reason },
    });
    revalidatePath("/admin/reviews");
    revalidatePath("/super-admin/feedback");
    return { success: "Review moderation saved." };
  } catch {
    return { error: "Unable to moderate this review." };
  }
}
