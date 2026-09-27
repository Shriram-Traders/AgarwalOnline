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
export const metadata = { title: "Support conversation", robots: { index: false } };
export default async function SupportConversation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const current = await requirePage("chat:support");
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
      <PageHeading eyebrow="Support conversation" title={conversation.title} />
      <div className="basket-layout">
        <ChatPanel
          conversationId={id}
          userId={user.id}
          staff
          initial={initial}
        />
        <aside className="panel">
          <h2>Conversation details</h2>
          <ActionForm
            action={conversationStatusAction}
            submit="Update conversation"
          >
            <input type="hidden" name="conversationId" value={id} />
            <label>
              Status
              <select name="status" defaultValue={conversation.status}>
                {[
                  "open",
                  "assigned",
                  "waiting-customer",
                  "waiting-support",
                  "resolved",
                  "closed",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" name="assignToSelf" />
              Assign to me
            </label>
          </ActionForm>
        </aside>
      </div>
    </section>
  );
}
