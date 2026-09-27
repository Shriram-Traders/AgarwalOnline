import { formatIst, timeAgo } from "@/lib/display";

/** A relative time ("12 min ago") with the exact IST time on hover and for machines. */
export function When({ at }: { at: Date | string }) {
  const date = new Date(at);
  return (
    <time dateTime={date.toISOString()} title={formatIst(date)}>
      {timeAgo(date)}
    </time>
  );
}
