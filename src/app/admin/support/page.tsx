import Link from "next/link";
import { Headphones } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { chatIdentity, scope } from "@/lib/chat/service";
import { ChatConversation, ChatMessage, ChatReceipt } from "@/lib/chat/models";
import { CHAT_VIEWS, chatStatusLabel, type ChatView } from "@/lib/chat/labels";
export const metadata = { title: "Support chats", robots: { index: false } };

export default async function SupportQueue({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const current = await requirePage("chat:support");
  const user = await chatIdentity(current.id);
  const params = await searchParams;
  const view = params.status && params.status in CHAT_VIEWS ? (params.status as ChatView) : null;
  const term = params.q?.trim().slice(0, 80);
  const conversations = await ChatConversation.find({
    ...scope(user),
    ...(view ? { status: { $in: [...CHAT_VIEWS[view].statuses] } } : {}),
    ...(term ? { title: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } : {}),
  })
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
  const filtered = Boolean(view || term);
  const waiting = rows.filter(({ conversation }) => conversation.status === "waiting-support").length;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Support chats"
        lead="Conversations with customers, newest activity first. Open one to reply."
      />
      <FilterBar label="Filter support chats" submitLabel="Show chats" clearHref={filtered ? "/admin/support" : undefined}>
        <label>
          Search <small>conversation title</small>
          <input name="q" defaultValue={term} maxLength={80} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={view ?? ""}>
            <option value="">Any status</option>
            {Object.entries(CHAT_VIEWS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{rows.length}</strong> {rows.length === 1 ? "conversation" : "conversations"}
          {waiting > 0 && ` · ${waiting} waiting for us`}
        </span>
      </p>
      <DataTable
        caption="Support conversations with their status, unread messages, who has them and the last activity"
        rows={rows}
        rowKey={({ conversation }) => String(conversation._id)}
        columns={[
          {
            header: "Conversation",
            cell: ({ conversation }) => (
              <Link href={`/admin/support/${conversation._id}`}>
                <strong>{conversation.title}</strong>
              </Link>
            ),
          },
          {
            header: "Status",
            cell: ({ conversation }) => (
              <StatusPill
                tone={
                  conversation.status === "waiting-support"
                    ? "warn"
                    : ["resolved", "closed"].includes(conversation.status)
                      ? "ok"
                      : "neutral"
                }
              >
                {chatStatusLabel(conversation.status)}
              </StatusPill>
            ),
          },
          { header: "Unread", numeric: true, cell: ({ unread }) => (unread ? <strong>{unread}</strong> : "None") },
          {
            header: "Assigned to",
            cell: ({ conversation }) =>
              !conversation.assignedAdminId
                ? "Nobody yet"
                : String(conversation.assignedAdminId) === user.id
                  ? "You"
                  : "Someone else",
          },
          { header: "Last activity", cell: ({ conversation }) => <When at={conversation.updatedAt} /> },
        ]}
        empty={
          <EmptyState
            icon={Headphones}
            title={filtered ? "No conversation matches" : "Your queue is clear"}
            body={filtered ? "Try other words, or clear the filters." : "New customer conversations arrive here."}
            heading="h3"
          />
        }
      />
    </section>
  );
}
