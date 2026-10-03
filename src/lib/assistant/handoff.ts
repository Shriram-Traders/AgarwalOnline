import { randomUUID } from "node:crypto";
import { z } from "zod";
import { chatIdentity, createConversation, sendMessage } from "../chat/service";
import type { Locale } from "../locale-types";
import { assistantCopy } from "./copy";

/**
 * Passes a signed-in shopper from the assistant to the store's live chat. The question they
 * typed goes in as the first message, so the staff see what was asked without asking again.
 * Returns the new conversation's id.
 */
export async function handOffToStore(userId: string, input: { question?: unknown; locale: Locale }) {
  const question = z.string().trim().max(1000).optional().catch(undefined).parse(input.question || undefined);
  const t = assistantCopy[input.locale];
  const title = question && question.length >= 3 ? `${t.handoffTitle}: ${question}`.slice(0, 100) : t.handoffTitle;
  const conversationId = await createConversation(userId, { title });
  if (question)
    await sendMessage(await chatIdentity(userId), { conversationId, clientMessageId: randomUUID(), body: question });
  return conversationId;
}
