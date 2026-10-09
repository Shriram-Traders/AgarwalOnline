"use client";

import { startTransition, useEffect } from "react";
import { notificationAction } from "@/lib/engagement/actions";

/**
 * Opening the notifications page marks everything read. It posts after the page shows,
 * so a link prefetch can never clear the badge before anyone has looked.
 */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) startTransition(() => void notificationAction({}, new FormData()));
  }, [unread]);
  return null;
}
