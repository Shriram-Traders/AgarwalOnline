"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import { currentLocale } from "../i18n";
import { log } from "../logger";
import { plainMessage } from "../form-errors";
import type { Locale } from "../locale-types";
import type { MutationState } from "../commerce/actions";
import { FEEDBACK_PERMISSION } from "./access";
import { feedbackCopy } from "./copy";
import { markFeedbackRead, markRestRead, replyToFeedback, skipFeedback, submitFeedback } from "./service";

/** What sending a rating gives back: the thank-you, and whether to point at the complaints form. */
export type FeedbackState = MutationState & { complaintType?: string };

/** The service's error codes, said the way a shopper would understand them, in their language. */
function shopperMessage(error: unknown, locale: Locale) {
  const text = feedbackCopy[locale].errors;
  // field names are English; Marathi readers get the plain line instead
  if (error instanceof z.ZodError) return locale === "en" ? plainMessage(error) : text.generic;
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED" || message === "FORBIDDEN") return text.signIn;
  if (message === "FEEDBACK_NOT_FOUND") return text.notFound;
  if (message === "FEEDBACK_NOT_DELIVERED") return text.notDelivered;
  if (message === "FEEDBACK_TOO_LATE") return text.tooLate;
  if (message === "FEEDBACK_ALREADY") return text.already;
  if (message.startsWith("Too many attempts")) return text.tooFast;
  log("error", "feedback.unexpected-error", { error });
  return text.generic;
}

/**
 * Sends a rating. Nothing is revalidated here: the popup refreshes the page itself once it
 * closes, or its thank-you would vanish with the header that holds it.
 */
export async function submitFeedbackAction(_state: FeedbackState, form: FormData): Promise<FeedbackState> {
  const locale = await currentLocale();
  try {
    const user = await requirePermission("order:own");
    const result = await submitFeedback(user.id, {
      orderId: form.get("orderId"),
      rating: form.get("rating"),
      tags: form.getAll("tags"),
      riderRating: form.get("riderRating") || undefined,
      comment: form.get("comment") ?? "",
      locale,
    });
    return { success: feedbackCopy[locale].thanks, complaintType: result.complaintType };
  } catch (error) {
    return { error: shopperMessage(error, locale) };
  }
}

/** "Not now": remembered so the popup doesn't come back for this order. */
export async function skipFeedbackAction(_state: MutationState, form: FormData): Promise<MutationState> {
  const locale = await currentLocale();
  try {
    const user = await requirePermission("order:own");
    await skipFeedback(user.id, { orderId: form.get("orderId") });
    return {};
  } catch (error) {
    return { error: shopperMessage(error, locale) };
  }
}

function ownerMessage(error: unknown) {
  if (error instanceof z.ZodError) return plainMessage(error);
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return "Please sign in again to continue.";
  if (message === "FORBIDDEN") return "Your account can’t do this.";
  if (message === "FEEDBACK_NOT_FOUND") return "That rating is no longer there.";
  if (message === "FEEDBACK_REPLIED") return "This rating already has a reply.";
  log("error", "feedback.unexpected-error", { error });
  return "Unable to save. Please try again.";
}
function refreshOwnerPages() {
  revalidatePath("/super-admin/feedback");
  // the overview's "Low ratings to read"
  revalidatePath("/admin");
}

/** The shop's reply to a rating: one per rating, shown to the customer. */
export async function replyFeedbackAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission(FEEDBACK_PERMISSION);
    await replyToFeedback(user.id, { feedbackId: form.get("feedbackId"), reply: form.get("reply") });
    refreshOwnerPages();
    return { success: "Reply sent. The customer sees it in their notifications and on their order." };
  } catch (error) {
    return { error: ownerMessage(error) };
  }
}

/** Mark one rating as read or unread, or everything of 3 stars and up as read. */
export async function feedbackReadAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission(FEEDBACK_PERMISSION);
    const intent = z.enum(["read", "unread", "rest"]).parse(form.get("intent"));
    if (intent === "rest") {
      const count = await markRestRead(user.id);
      refreshOwnerPages();
      return { success: count === 1 ? "1 rating marked as read." : `${count} ratings marked as read.` };
    }
    await markFeedbackRead(user.id, { feedbackId: form.get("feedbackId"), read: intent === "read" });
    refreshOwnerPages();
    return { success: intent === "read" ? "Marked as read." : "Marked as unread." };
  } catch (error) {
    return { error: ownerMessage(error) };
  }
}
