"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import * as family from "./service";
import { kitToBasket, promoteChild } from "./kits";
import { requestTab } from "./tab";

function errorMessage(e: unknown) {
  if (e instanceof z.ZodError) return plainMessage(e);
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHENTICATED" || message === "FORBIDDEN") return "Please sign in first.";
  if (/^(This|These|Only|You|The|Remove|Give|Keep|Pick|Write)/.test(message)) return message;
  // the customer sees a plain sentence; the real cause goes to the server log
  log("error", "family.unexpected-error", { error: e });
  return "Unable to save. Please try again.";
}

/** Every family form posts here with an `intent`; the service decides who may make each change. */
export async function familyAction(_state: MutationState, form: FormData): Promise<MutationState> {
  let next: string | null = null;
  let success = "Saved.";
  try {
    const user = await requirePermission("order:own");
    switch (form.get("intent")) {
      case "create":
        await family.createFamily(user.id, form.get("name"));
        success = "Family started. Invite the others with the link.";
        break;
      case "join":
        await family.joinFamily(user.id, form.get("token"));
        next = "/account/family";
        break;
      case "leave":
        await family.leaveFamily(user.id);
        next = "/account";
        break;
      case "remove-person":
        await family.removeAdult(user.id, form.get("personId"));
        success = "Removed.";
        break;
      case "reset-link":
        await family.resetFamilyLink(user.id);
        success = "New link made. The old one no longer works.";
        break;
      case "delete":
        await family.deleteFamily(user.id);
        next = "/account";
        break;
      case "save-child":
        await family.saveChild(user.id, {
          childId: form.get("childId") ?? "",
          name: form.get("name"),
          school: form.get("school") ?? "",
          className: form.get("className"),
        });
        break;
      case "kit": {
        // Buy kit: into the basket, then checkout with the order already tagged to the child
        await kitToBasket(user.id, form.get("childId"));
        next = `/checkout?for=${encodeURIComponent(String(form.get("childId")))}`;
        break;
      }
      case "promote":
        await promoteChild(user.id, { childId: form.get("childId"), year: form.get("year"), moved: form.get("moved") });
        break;
      case "request-tab":
        await requestTab(user.id);
        success = "Asked. The store will be in touch before the tab opens.";
        break;
      case "remove-child":
        await family.removeChild(user.id, form.get("childId"));
        success = "Removed.";
        break;
      default:
        return { error: "Unable to save. Please try again." };
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  if (next) redirect(next);
  return { success };
}
