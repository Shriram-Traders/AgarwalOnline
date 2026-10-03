/** Plain words for a conversation's state, for staff; the stored values stay the same. */
export const CHAT_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  assigned: "Someone is on it",
  "waiting-customer": "Waiting for the customer",
  "waiting-support": "Waiting for us",
  resolved: "Resolved",
  closed: "Closed",
};
export function chatStatusLabel(status: string) {
  return CHAT_STATUS_LABELS[status] ?? status;
}

/** The support list's filter: what each choice means in stored states. */
export const CHAT_VIEWS = {
  "needs-reply": { label: "Needs a reply", statuses: ["waiting-support", "open"] },
  "waiting-customer": { label: "Waiting for the customer", statuses: ["waiting-customer"] },
  assigned: { label: "Someone is on it", statuses: ["assigned"] },
  done: { label: "Done", statuses: ["resolved", "closed"] },
} as const;
export type ChatView = keyof typeof CHAT_VIEWS;
