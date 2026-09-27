"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { ensureSaved, toggleWishlist } from "../engagement/service";
import * as lists from "./service";

function errorMessage(e: unknown) {
  if (e instanceof z.ZodError) return plainMessage(e);
  const message = e instanceof Error ? e.message : "";
  if (message === "UNAUTHENTICATED" || message === "FORBIDDEN") return "Please sign in first.";
  if (/^(This|These|Only|You can|A list|Give|Keep)/.test(message)) return message;
  // the customer sees a plain sentence; the real cause goes to the server log
  log("error", "lists.unexpected-error", { error: e });
  return "Unable to save. Please try again.";
}

/** Every board and basket form posts here with an `intent`; the service decides who may make each change. */
export async function listAction(_state: MutationState, form: FormData): Promise<MutationState> {
  const listId = form.get("listId");
  // where Leave and Delete land: Saved for a board, the basket for a basket
  const back = form.get("back") === "/cart" ? "/cart" : "/account/wishlist";
  let next: string | null = null;
  let success = "Saved.";
  try {
    const user = await requirePermission("cart:own");
    switch (form.get("intent")) {
      case "create": {
        const kind = form.get("kind") === "board" ? "board" : "basket";
        const id = await lists.createList(user.id, form.get("name"), kind);
        next = lists.listHref({ _id: id, kind });
        break;
      }
      case "add": {
        // "Add to a different basket": typing a new name starts a new basket
        const id = form.get("name") ? await lists.createList(user.id, form.get("name"), "basket") : listId;
        await lists.saveListItem(user.id, id, form.get("variantId"), form.get("quantity"), true);
        success = "Added.";
        break;
      }
      case "save": {
        // "Save to…": the Saved row is the heart; a board also keeps the product in Saved
        if (form.get("board") === "saved") {
          success = (await toggleWishlist(user.id, form.get("productId"))) ? "Saved." : "Removed from Saved.";
          break;
        }
        const id = form.get("name") ? await lists.createList(user.id, form.get("name"), "board") : form.get("board");
        await ensureSaved(user.id, form.get("productId"));
        await lists.saveListItem(user.id, id, form.get("variantId"), 1, true);
        success = "Saved to the board.";
        break;
      }
      case "set":
        await lists.saveListItem(user.id, listId, form.get("variantId"), form.get("quantity"));
        break;
      case "basket":
      case "checkout": {
        const { added, skipped } = await lists.listToBasket(user.id, { listId, token: form.get("token") });
        success = `${added} item${added === 1 ? "" : "s"} added to your basket${skipped ? ` · ${skipped} unavailable` : ""}.`;
        // "Buy this board" and "Order <basket>" go straight on to checkout, unless nothing could be added
        if (form.get("intent") === "checkout" && added) next = "/checkout";
        break;
      }
      case "join":
        next = (await lists.joinList(user.id, form.get("token"))).href;
        break;
      case "leave":
        await lists.leaveList(user.id, listId);
        next = back;
        break;
      case "remove-person":
        await lists.removePerson(user.id, listId, form.get("personId"));
        success = "Removed.";
        break;
      case "link-edit":
        await lists.setLinkEdit(user.id, listId, form.get("on") === "true");
        success = form.get("on") === "true" ? "People with the link can add and change things." : "People with the link can look and buy.";
        break;
      case "reset":
        await lists.resetLinks(user.id, listId);
        success = "New link made. The old one no longer works.";
        break;
      case "delete":
        await lists.deleteList(user.id, listId);
        next = back;
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
