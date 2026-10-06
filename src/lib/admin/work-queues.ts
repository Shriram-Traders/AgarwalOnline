import type { Model } from "mongoose";
import { hasPermission, type Permission, type Role } from "@/lib/auth/permissions";
import { connectDB } from "@/lib/db/connect";
import { InventoryItem } from "@/lib/db/models";
import { Order } from "@/lib/commerce/models";
import { CODCollection } from "@/lib/operations/models";
import { ChatConversation } from "@/lib/chat/models";
import { Complaint } from "@/lib/aftercare/models";
import { ApprovalRequest } from "@/lib/governance/models";
import { Refund } from "@/lib/payments/models";
import { OrderFeedback } from "@/lib/feedback/models";
import { FEEDBACK_PERMISSION } from "@/lib/feedback/access";
import { NEEDS_ATTENTION } from "@/lib/feedback/rules";
import { FILTERS } from "./order-filters";
import type { CountKey, StaffCountsResponse } from "@/lib/staff/types";

export type QueueKey =
  | "toConfirm"
  | "packing"
  | "ready"
  | "notDelivered"
  | "cash"
  | "chats"
  | "complaints"
  | "lowRatings"
  | "approvals"
  | "refundOwed"
  | "refunds"
  | "soldOut";

type QueueDef = {
  key: QueueKey;
  label: string;
  /** One line on why it matters. */
  note: string;
  /** The one button beside it. */
  action: string;
  permission: Permission;
  model: Model<unknown>;
  filter: object;
  /** What "waiting since" is measured from; none means the queue has no age (sold-out packs). */
  sortField?: string;
  listHref: string;
  /** Where the button goes for the oldest item; the list when there's no single item to open. */
  itemHref?: (id: string) => string;
  /** After this long the waiting time turns red. */
  lateAfterMinutes: number;
};

const SOLD_OUT = { $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 0] } };
const LOW_STOCK = { $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 10] } };
const asModel = (model: unknown) => model as Model<unknown>;

/** Everything that can wait on the team, oldest-first within each. Filters match the order list's steps. */
export const QUEUES: QueueDef[] = [
  {
    key: "toConfirm",
    label: "Orders to confirm",
    note: "Customers are waiting to hear their order is accepted.",
    action: "Confirm",
    permission: "order:manage",
    model: asModel(Order),
    filter: FILTERS["to-confirm"].match,
    sortField: "createdAt",
    listHref: "/admin?status=to-confirm#orders",
    itemHref: (id) => `/admin/orders/${id}`,
    lateAfterMinutes: 60,
  },
  {
    key: "packing",
    label: "Orders being packed",
    note: "Packing started but isn’t finished.",
    action: "Open",
    permission: "order:manage",
    model: asModel(Order),
    filter: FILTERS.packing.match,
    sortField: "updatedAt",
    listHref: "/admin?status=packing#orders",
    itemHref: (id) => `/admin/orders/${id}`,
    lateAfterMinutes: 240,
  },
  {
    key: "ready",
    label: "Packed, no rider assigned",
    note: "Ready to go out once someone is assigned.",
    action: "Assign",
    permission: "order:manage",
    model: asModel(Order),
    filter: FILTERS.ready.match,
    sortField: "updatedAt",
    listHref: "/admin?status=ready#orders",
    itemHref: (id) => `/admin/orders/${id}#assign-rider`,
    lateAfterMinutes: 60,
  },
  {
    key: "notDelivered",
    label: "Deliveries that didn’t go through",
    note: "Try again, or return the stock to the shelf.",
    action: "Decide",
    permission: "order:manage",
    model: asModel(Order),
    filter: FILTERS["not-delivered"].match,
    sortField: "updatedAt",
    listHref: "/admin?status=not-delivered#orders",
    itemHref: (id) => `/admin/orders/${id}`,
    lateAfterMinutes: 120,
  },
  {
    key: "cash",
    label: "Cash collections to reconcile",
    note: "Cash riders collected that hasn’t been counted in.",
    action: "Reconcile",
    permission: "cod:reconcile",
    model: asModel(CODCollection),
    filter: { reconciledAt: null },
    sortField: "createdAt",
    listHref: "/admin/cod",
    lateAfterMinutes: 24 * 60,
  },
  {
    key: "chats",
    label: "Support chats waiting for a reply",
    note: "A customer asked something and is waiting.",
    action: "Reply",
    permission: "chat:support",
    model: asModel(ChatConversation),
    filter: { status: "waiting-support" },
    sortField: "updatedAt",
    listHref: "/admin/support",
    itemHref: (id) => `/admin/support/${id}`,
    lateAfterMinutes: 30,
  },
  {
    key: "complaints",
    label: "Open complaints",
    note: "Someone reported a problem with an order.",
    action: "Open",
    permission: "complaint:manage",
    model: asModel(Complaint),
    filter: { status: "open" },
    sortField: "createdAt",
    listHref: "/admin/complaints",
    itemHref: (id) => `/admin/complaints?view=${id}#complaint`,
    lateAfterMinutes: 24 * 60,
  },
  {
    // one or two stars: a customer worth getting back to while the order is fresh
    key: "lowRatings",
    label: "Low ratings to read",
    note: "A customer gave an order 1 or 2 stars.",
    action: "Read",
    permission: FEEDBACK_PERMISSION,
    model: asModel(OrderFeedback),
    filter: NEEDS_ATTENTION,
    sortField: "submittedAt",
    listHref: "/super-admin/feedback?tab=attention",
    itemHref: (id) => `/super-admin/feedback?tab=attention&reply=${id}#reply`,
    lateAfterMinutes: 24 * 60,
  },
  {
    key: "approvals",
    label: "Changes waiting for your approval",
    note: "New products, price changes or big stock changes.",
    action: "Review",
    permission: "approval:review",
    model: asModel(ApprovalRequest),
    filter: { state: "pending" },
    sortField: "createdAt",
    listHref: "/super-admin/approvals",
    itemHref: (id) => `/super-admin/approvals?review=${id}#review`,
    lateAfterMinutes: 24 * 60,
  },
  {
    // promised to customers when packing found items missing; nothing else reminds the owner
    key: "refundOwed",
    label: "Refunds owed for items not packed",
    note: "Paid online, but part of the order couldn’t be packed.",
    action: "Refund",
    permission: "refund:write",
    model: asModel(Order),
    filter: FILTERS["refund-owed"].match,
    sortField: "updatedAt",
    listHref: "/admin?status=refund-owed#orders",
    itemHref: (id) => `/super-admin/refunds?order=${id}`,
    lateAfterMinutes: 24 * 60,
  },
  {
    key: "refunds",
    label: "Refunds in progress",
    note: "Started but not yet paid back.",
    action: "Open",
    permission: "refund:write",
    model: asModel(Refund),
    filter: { status: { $in: ["requested", "processing"] } },
    listHref: "/super-admin/refunds",
    sortField: "createdAt",
    lateAfterMinutes: 48 * 60,
  },
  {
    key: "soldOut",
    label: "Packs sold out",
    note: "Shoppers can’t buy these until stock is added.",
    action: "Restock",
    permission: "inventory:adjust",
    model: asModel(InventoryItem),
    filter: SOLD_OUT,
    listHref: "/admin/inventory?stock=out",
    lateAfterMinutes: Infinity,
  },
];

export type QueueState = {
  key: QueueKey;
  label: string;
  note: string;
  action: string;
  count: number;
  /** When the oldest item started waiting, or null for an empty or ageless queue. */
  oldest: Date | null;
  late: boolean;
  listHref: string;
  /** The button: the oldest item when it has its own page, otherwise the list. */
  actionHref: string;
};

/** Every queue this person may act on, with its count and its oldest item. */
export async function loadQueues(roles: readonly Role[], now = new Date()): Promise<QueueState[]> {
  await connectDB();
  const defs = QUEUES.filter((def) => hasPermission(roles, def.permission));
  return Promise.all(
    defs.map(async (def) => {
      const [count, oldest] = await Promise.all([
        def.model.countDocuments(def.filter),
        def.sortField
          ? (def.model
              .findOne(def.filter)
              .sort({ [def.sortField]: 1 })
              .select(def.sortField)
              .lean() as Promise<(Record<string, Date> & { _id: unknown }) | null>)
          : null,
      ]);
      const since = def.sortField ? (oldest?.[def.sortField] ?? null) : null;
      const late = Boolean(since && now.getTime() - since.getTime() > def.lateAfterMinutes * 60000);
      return {
        key: def.key,
        label: def.label,
        note: def.note,
        action: def.action,
        count,
        oldest: since,
        late,
        listHref: def.listHref,
        actionHref: oldest && def.itemHref && count ? def.itemHref(String(oldest._id)) : def.listHref,
      };
    }),
  );
}

/**
 * The small numbers in the staff menu and on the bell. Counts only, no lookups, and never the
 * slot top-up the overview runs: this is asked on every page change.
 */
export async function staffCounts(user: { id: string; roles: readonly Role[] }): Promise<StaffCountsResponse> {
  await connectDB();
  const can = (permission: Permission) => hasPermission(user.roles, permission);
  const wanted: [CountKey, Permission, () => Promise<number>][] = [
    ["orders", "order:manage", () => Order.countDocuments(FILTERS["to-confirm"].match)],
    ["chats", "chat:support", () => ChatConversation.countDocuments({ status: "waiting-support" })],
    ["complaints", "complaint:manage", () => Complaint.countDocuments({ status: "open" })],
    ["lowStock", "inventory:adjust", () => InventoryItem.countDocuments(LOW_STOCK)],
    ["approvals", "approval:review", () => ApprovalRequest.countDocuments({ state: "pending" })],
    ["feedback", FEEDBACK_PERMISSION, () => OrderFeedback.countDocuments(NEEDS_ATTENTION)],
    [
      "deliveries",
      "delivery:assigned",
      () =>
        Order.countDocuments({
          assignedTo: user.id,
          orderStatus: "confirmed",
          deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] },
        }),
    ],
  ];
  const queues = QUEUES.filter((def) => def.key !== "soldOut" && can(def.permission));
  const [counts, queueCounts] = await Promise.all([
    Promise.all(wanted.filter(([, permission]) => can(permission)).map(async ([key, , count]) => [key, await count()] as const)),
    Promise.all(queues.map((def) => def.model.countDocuments(def.filter))),
  ]);
  const map = Object.fromEntries(counts) as Partial<Record<CountKey, number>>;
  const needsYou = queueCounts.reduce((sum, n) => sum + n, 0) + (map.deliveries ?? 0);
  return { at: new Date().toISOString(), counts: map, needsYou };
}
