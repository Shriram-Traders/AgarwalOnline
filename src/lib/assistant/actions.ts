"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser, requirePermission } from "../auth/session";
import { rateLimit } from "../auth/rate-limit";
import { digest } from "../auth/crypto";
import { currentLocale } from "../i18n";
import { log } from "../logger";
import type { MutationState } from "../commerce/actions";
import { assistantCopy } from "./copy";
import { handOffToStore } from "./handoff";
import { shopAssistantEnabled } from "./flags";
import { assistantReply } from "./service";
import { INTENTS, type AssistantReply } from "./types";

const TOO_MANY = "Too many attempts. Please try again later.";

/** One question to the shop assistant: a typed message or a topic chip. Never throws. */
export async function askAssistant(input: unknown): Promise<AssistantReply> {
  const locale = await currentLocale();
  const t = assistantCopy[locale];
  if (!shopAssistantEnabled()) return { bubbles: [] };
  try {
    const data = z
      .object({
        text: z.string().max(300).optional(),
        intent: z.enum(INTENTS).optional(),
      })
      .parse(input);
    const user = await currentUser();
    const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    // per account when signed in, per connection otherwise
    await rateLimit(`assistant:${user?.id ?? digest(forwarded)}`, 30, 60_000);
    return await assistantReply({ ...data, userId: user?.id, locale });
  } catch (error) {
    if (error instanceof Error && error.message === TOO_MANY) return { bubbles: [{ kind: "text", text: t.tooFast }] };
    log("error", "assistant.unexpected-error", { error });
    return { bubbles: [{ kind: "text", text: t.error }, { kind: "chips" }] };
  }
}

/** "Chat with the store": opens a live chat with the question already sent, then goes there. */
export async function assistantHandoffAction(_state: MutationState, form: FormData): Promise<MutationState> {
  const locale = await currentLocale();
  let to = "";
  if (!shopAssistantEnabled()) return { error: assistantCopy[locale].error };
  try {
    const user = await requirePermission("chat:own");
    to = `/account/support/${await handOffToStore(user.id, { question: form.get("question"), locale })}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHENTICATED") return { error: assistantCopy[locale].humanSignIn };
    if (message === TOO_MANY) return { error: assistantCopy[locale].tooFast };
    log("error", "assistant.handoff-failed", { error });
    return { error: assistantCopy[locale].error };
  }
  redirect(to);
}
