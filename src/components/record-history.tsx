import { AuditLog, User } from "@/lib/db/models";
import { connectDB } from "@/lib/db/connect";
import { auditLabel } from "@/lib/audit-labels";
import { When } from "./when";

/** The audit entries recorded against one record, newest first, so history reads next to the thing it describes. */
export async function RecordHistory({
  target,
  title = "History",
  limit = 20,
}: {
  target: string;
  title?: string;
  limit?: number;
}) {
  await connectDB();
  const entries = await AuditLog.find({ target })
    .sort({ at: -1 })
    .limit(limit)
    .select("actorId action at");
  if (!entries.length) return null;
  const actors = await User.find({
    _id: { $in: [...new Set(entries.map((entry) => String(entry.actorId)))] },
  }).select("name");
  const names = new Map(actors.map((actor) => [String(actor._id), actor.name]));
  return (
    <details className="panel record-history">
      <summary>
        {title} <small>{entries.length} recent</small>
      </summary>
      <ol>
        {entries.map((entry) => (
          <li key={String(entry._id)}>
            <strong>{auditLabel(entry.action)}</strong>
            <small>
              {names.get(String(entry.actorId)) ?? "System"} · <When at={entry.at} /> · <code>{entry.action}</code>
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}
