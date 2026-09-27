import Link from "next/link";
import { Headphones } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { chatIdentity, scope } from "@/lib/chat/service";
import { ChatConversation, ChatMessage, ChatReceipt } from "@/lib/chat/models";
import { displayStatus } from "@/lib/display";
export const metadata = { title: "Support chats", robots: { index: false } };
export default async function SupportQueue() {
  const current = await requirePage("chat:support");
  const user = await chatIdentity(current.id);
  const conversations = await ChatConversation.find(scope(user))
    .sort({ updatedAt: -1 })
    .limit(100);
  const rows = await Promise.all(
    conversations.map(async (conversation) => {
      const receipt = await ChatReceipt.findOne({
        conversationId: conversation._id,
        userId: user.id,
      });
      const unread = await ChatMessage.countDocuments({
        conversationId: conversation._id,
        senderId: { $ne: user.id },
        sequence: { $gt: receipt?.readSequence ?? 0 },
      });
      return { conversation, unread };
    }),
  );
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Customer care"
        title="Support inbox"
        lead="Conversations waiting on the store."
      />
      {rows.length ? (
        rows.map(({ conversation: c, unread }) => (
          <Link
            className="panel order-row"
            key={String(c._id)}
            href={`/admin/support/${c._id}`}
          >
            <strong>{c.title}</strong>
            <span>
              {displayStatus(c.status)}
              {unread ? ` · ${unread} unread` : ""}
            </span>
            <span>{c.assignedAdminId ? "Assigned" : "Unassigned"} →</span>
          </Link>
        ))
      ) : (
        <EmptyState icon={Headphones} title="Your queue is clear" body="New customer conversations arrive here." />
      )}
    </section>
  );
}
