import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { ChatConversation, ChatMessage, ChatReceipt } from "@/lib/chat/models";
import { ActionForm } from "@/components/action-form";
import { conversationAction } from "@/lib/chat/actions";
import { displayStatus } from "@/lib/display";
export const metadata = { title: "Talk to the store", robots: { index: false } };
export default async function Support() {
  const user = await requirePage("chat:own");
  const conversations = await ChatConversation.find({ customerId: user.id })
    .sort({ updatedAt: -1 })
    .limit(50);
  const rows = await Promise.all(
    conversations.map(async (c) => {
      const receipt = await ChatReceipt.findOne({
        conversationId: c._id,
        userId: user.id,
      });
      const unread = await ChatMessage.countDocuments({
        conversationId: c._id,
        internal: false,
        senderId: { $ne: user.id },
        sequence: { $gt: receipt?.readSequence ?? 0 },
      });
      return { id: String(c._id), title: c.title, status: c.status, unread };
    }),
  );
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="A real person, a little help"
        title="Talk to your store"
        lead="Ask about an order, a product or a delivery."
      />
      <div className="basket-layout">
        <div>
          {rows.map((c) => (
            <Link
              className="panel order-row"
              key={c.id}
              href={`/account/support/${c.id}`}
            >
              <strong>{c.title}</strong>
              <span>
                {displayStatus(c.status)}
                {c.unread ? ` · ${c.unread} unread` : ""} →
              </span>
            </Link>
          ))}
          {!rows.length && (
            <EmptyState icon={MessagesSquare} title="No conversations yet" body="Use the form to ask the store anything." />
          )}
        </div>
        <div className="panel">
          <h2>How can we help?</h2>
          <ActionForm action={conversationAction} submit="Start conversation">
            <label>
              Subject
              <input
                name="title"
                placeholder="A question about my order"
                minLength={3}
                maxLength={100}
                required
              />
            </label>
          </ActionForm>
        </div>
      </div>
    </section>
  );
}
