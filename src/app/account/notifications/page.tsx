import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Notification } from "@/lib/engagement/models";
import { MarkRead } from "@/components/mark-read";
export const metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const user = await requirePage("profile:own");
  const notifications = await Notification.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(100);
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">UPDATES</span>
          <h1>Notifications</h1>
          <p>Orders, family, payments, delivery and support updates in one place.</p>
        </div>
        <span className="live-chip">{unread} unread</span>
      </div>
      <MarkRead unread={unread} />
      <div className="notification-list">
        {notifications.map((item) => (
          <article
            className={`panel notification-row ${item.readAt ? "" : "unread"}`}
            key={String(item._id)}
          >
            <Bell size={20} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small>
                {new Date(item.createdAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}
              </small>
            </div>
            {item.href && <Link href={item.href}>Open →</Link>}
          </article>
        ))}
        {!notifications.length && (
          <div className="panel empty-state">
            <BellOff size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
            <h2>All quiet for now</h2>
            <p>Your store updates will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
