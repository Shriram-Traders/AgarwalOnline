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
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Your store is here to help"
        title={conversation.title}
        lead={displayStatus(conversation.status)}
      />
      {["closed", "resolved"].includes(conversation.status) && (
        <ActionForm
          action={conversationStatusAction}
          submit="Reopen conversation"
        >
          <input type="hidden" name="conversationId" value={id} />
          <input type="hidden" name="status" value="open" />
        </ActionForm>
      )}
      <ChatPanel
        conversationId={id}
        userId={user.id}
        staff={false}
        initial={initial}
      />
    </section>
  );
}
