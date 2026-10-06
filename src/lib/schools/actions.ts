"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";
import { formWithPaise } from "../display";
import { quoteMoney } from "./display";
import { log } from "../logger";
import {
  addRepresentative,
  createSchool,
  removeRepresentative,
  requestAccess,
  resetJoinLink,
  reviewAccessRequest,
  setJoinOpen,
  setSchoolActive,
  updateSchool,
  withdrawAccessRequest,
} from "./members";
import {
  addToQuote,
  closeQuoteRequest,
  respondToQuotation,
  saveQuoteDraft,
  sendQuotation,
  setQuoteLine,
  submitQuoteRequest,
} from "./quotes";
import { sheetFromForm } from "./quote-form";

/** Messages the school services write for people; anything else is unexpected and stays generic. */
const PLAIN =
  /^(This |That |The GSTIN|Enter a|Choose|Check |PIN code|Someone at|Remove |Add |Only |A newer|Nothing to|The draft|Quotations|Ask for|Accept|Keep |Save )|already represents/;

function plain(error: unknown, scope: string) {
  if (error instanceof z.ZodError) return plainMessage(error);
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return "Please sign in again to continue.";
  if (message === "SCHOOL_UNAVAILABLE" || message === "FORBIDDEN") return "This school area is unavailable.";
  if (PLAIN.test(message)) return message;
  log("error", `${scope}.unexpected-error`, { error });
  return "Unable to save. Please try again.";
}

const refresh = () => {
  revalidatePath("/super-admin/schools", "layout");
  revalidatePath("/school", "layout");
  // the header shows members a link to their school
  revalidatePath("/", "layout");
};

/** Everything the owner does with schools and their representatives. */
export async function schoolAdminAction(_state: MutationState, form: FormData): Promise<MutationState> {
  let created = "";
  try {
    const user = await requirePermission("settings:write");
    const operation = z
      .enum([
        "create",
        "update",
        "pause",
        "resume",
        "reset-link",
        "link-open",
        "link-close",
        "add-member",
        "remove-member",
        "approve",
        "decline",
      ])
      .parse(form.get("operation"));
    const fields = Object.fromEntries(form);
    const schoolId = form.get("schoolId");
    let success = "";
    switch (operation) {
      case "create":
        created = (await createSchool(user.id, fields)).id;
        break;
      case "update":
        await updateSchool(user.id, fields);
        success = "School details saved.";
        break;
      case "pause":
      case "resume":
        await setSchoolActive(user.id, { schoolId, active: operation === "resume" });
        success =
          operation === "pause"
            ? "School paused. Its representatives can’t use the school area until you resume it."
            : "School resumed.";
        break;
      case "reset-link":
        await resetJoinLink(user.id, schoolId);
        success = "A new link is ready. The old one no longer works.";
        break;
      case "link-open":
      case "link-close":
        await setJoinOpen(user.id, { schoolId, open: operation === "link-open" });
        success = operation === "link-open" ? "The link works again." : "The link no longer lets people ask to join.";
        break;
      case "add-member": {
        const { name } = await addRepresentative(user.id, { schoolId, userId: form.get("userId") });
        success = `${name} can now ask for this school’s quotations.`;
        break;
      }
      case "remove-member":
        await removeRepresentative(user.id, { schoolId, userId: form.get("userId") });
        success = "Representative removed.";
        break;
      case "approve":
      case "decline":
        await reviewAccessRequest(user.id, { ...fields, decision: operation });
        success = operation === "approve" ? "Approved. They can use the school area now." : "Request declined.";
        break;
    }
    refresh();
    if (!created) return { success };
  } catch (error) {
    return { error: plain(error, "schools") };
  }
  redirect(`/super-admin/schools/${created}`);
}

/** What a representative (or someone asking to be one) does in the school area. */
export async function schoolRepAction(_state: MutationState, form: FormData): Promise<MutationState> {
  let to = "";
  try {
    const user = await requirePermission("profile:own");
    const intent = z
      .enum(["request-access", "withdraw-access", "add", "set", "submit", "accept", "changes"])
      .parse(form.get("intent"));
    const fields = Object.fromEntries(form);
    let success = "";
    switch (intent) {
      case "request-access": {
        const { state } = await requestAccess(user.id, { token: form.get("token"), message: form.get("message") });
        success =
          state === "member"
            ? "You already represent this school."
            : "Request sent. The store will tell you when it’s approved.";
        break;
      }
      case "withdraw-access":
        await withdrawAccessRequest(user.id, form.get("requestId"));
        success = "Request withdrawn.";
        break;
      case "add": {
        const { quantity } = await addToQuote(user.id, fields);
        success = `Added. The basket now has ${quantity.toLocaleString("en-IN")} of this.`;
        break;
      }
      case "set":
        await setQuoteLine(user.id, fields);
        success = Number(form.get("quantity")) ? "Quantity saved." : "Taken out of the basket.";
        break;
      case "submit": {
        const { id } = await submitQuoteRequest(user.id, fields);
        to = `/school/quotations/${id}?sent=1`;
        break;
      }
      case "accept":
      case "changes":
        await respondToQuotation(user.id, { ...fields, decision: intent });
        success =
          intent === "accept"
            ? "Accepted. The store has been told and will be in touch."
            : "Sent to the store. You’ll get a revised quotation.";
        break;
    }
    refresh();
    if (!to) return { success };
  } catch (error) {
    return { error: plain(error, "school-rep") };
  }
  redirect(to);
}

/** The owner's quotation desk: save the prices, send them as the next version, or close the request. */
export async function quoteDeskAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("settings:write");
    const operation = z.enum(["save-draft", "send", "close"]).parse(form.get("operation"));
    const requestId = form.get("requestId");
    let success = "";
    if (operation === "save-draft") {
      await saveQuoteDraft(user.id, requestId, sheetFromForm(formWithPaise(form)));
      success = "Draft saved. Check the totals, then send it.";
    } else if (operation === "send") {
      const sent = await sendQuotation(user.id, { requestId, stamp: form.get("stamp") });
      const reach = [
        sent.sent ? `emailed to ${sent.sent}` : null,
        sent.noEmail ? `${sent.noEmail} without an email address` : null,
        sent.failed ? `${sent.failed} couldn’t be emailed` : null,
      ].filter(Boolean);
      success = `Version ${sent.version} sent (${quoteMoney(sent.totalPaise)} with GST). The school sees it in its area${
        reach.length ? `; ${reach.join(", ")}` : ""
      }.`;
    } else {
      await closeQuoteRequest(user.id, { requestId, reason: form.get("reason") });
      success = "Request closed. The school has been told.";
    }
    revalidatePath("/super-admin/quotations", "layout");
    revalidatePath("/school", "layout");
    return { success };
  } catch (error) {
    return { error: plain(error, "quote-desk") };
  }
}
