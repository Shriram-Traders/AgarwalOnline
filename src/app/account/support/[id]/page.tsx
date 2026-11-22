import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import {
  chatIdentity,
  authorizeConversation,
  syncConversation,
} from "@/lib/chat/service";
import { ChatPanel } from "@/components/chat-panel";
import { ActionForm } from "@/components/action-form";
import { conversationStatusAction } from "@/lib/chat/actions";
import { displayStatus } from "@/lib/display";
export const metadata = { title: "Conversation with the store", robots: { index: false } };
/**
 * One conversation with the store. On a phone it fills the screen like a messaging app (the chat's
 * own bar replaces this heading and the shop's header and tabs); on a computer it's a card on the page.
 */
export default async function Conversation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const current = await requirePage("chat:own");
  const user = await chatIdentity(current.id);
  const { id } = await params;
  let conversation;
  try {
    conversation = await authorizeConversation(user, id);
  } catch {
    notFound();
  }
  const initial = await syncConversation(user, {
    conversationId: id,
    after: 0,
  });
  const status = displayStatus(conversation.status);
  return (
    <section className="page-container chat-page">
      <PageHeading
        eyebrow="Your store is here to help"
        title={conversation.title}
        lead={status}
      />
      <ChatPanel
        conversationId={id}
        userId={user.id}
        staff={false}
        initial={initial}
        screen={{ title: conversation.title, status, backHref: "/account/support" }}
        notice={
          ["closed", "resolved"].includes(conversation.status) ? (
            <ActionForm action={conversationStatusAction} submit="Reopen conversation" className="form-stack chat-reopen">
              <input type="hidden" name="conversationId" value={id} />
              <input type="hidden" name="status" value="open" />
              <p className="muted">This conversation is {status.toLowerCase()}. Reopen it to send a message.</p>
            </ActionForm>
          ) : null
        }
      />
    </section>
  );
}
