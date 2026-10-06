/** What the staff menu can show a count beside. Each is only sent to people allowed to act on it. */
export type CountKey = "orders" | "chats" | "complaints" | "lowStock" | "approvals" | "deliveries" | "feedback";

/** Body of GET /api/staff/counts. */
export type StaffCountsResponse = {
  /** When the counts were taken (ISO). */
  at: string;
  counts: Partial<Record<CountKey, number>>;
  /** Everything waiting on this person across the work queues: the number on the bell. */
  needsYou: number;
};
