import { hasPermission, type Permission, type Role } from "@/lib/auth/permissions";
import { FEEDBACK_PERMISSION } from "@/lib/feedback/access";
import { STAFF_ROOTS } from "./paths";
import type { CountKey } from "./types";

export type StaffNavKey =
  | "overview"
  | "chats"
  | "complaints"
  | "catalog"
  | "customers"
  | "feedback"
  | "reviews"
  | "cod"
  | "tabs"
  | "refunds"
  | "offers"
  | "analytics"
  | "schools"
  | "quotations"
  | "settings"
  | "staff"
  | "approvals"
  | "audit"
  | "deliveries";
export type StaffGroupKey = "today" | "products" | "customers" | "money" | "schools" | "setup" | "delivery";
export type StaffNavItem = {
  key: StaffNavKey;
  href: string;
  /** The permission the page itself checks, so a link never leads to "forbidden". */
  permission: Permission;
  count?: CountKey;
  /** Sibling routes that keep this entry highlighted. */
  also?: string[];
};
export type StaffNavGroup = { key: StaffGroupKey; items: StaffNavItem[]; folded?: boolean };

/**
 * The staff menu, grouped by the job at hand rather than by who may see it. Labels live in the
 * locale dictionary (`copy[locale].staff`), icons in the component. Add every new staff page here
 * and to the search index.
 */
export const STAFF_NAV: StaffNavGroup[] = [
  {
    key: "today",
    items: [
      { key: "overview", href: "/admin", permission: "order:manage", count: "orders" },
      { key: "chats", href: "/admin/support", permission: "chat:support", count: "chats" },
      { key: "complaints", href: "/admin/complaints", permission: "complaint:manage", count: "complaints" },
    ],
  },
  {
    key: "products",
    items: [
      {
        key: "catalog",
        href: "/admin/products",
        permission: "catalog:write",
        count: "lowStock",
        also: ["/admin/categories", "/admin/inventory", "/admin/kits"],
      },
    ],
  },
  {
    key: "customers",
    items: [
      { key: "customers", href: "/admin/customers", permission: "order:manage" },
      { key: "feedback", href: "/super-admin/feedback", permission: FEEDBACK_PERMISSION, count: "feedback" },
      { key: "reviews", href: "/admin/reviews", permission: "review:moderate" },
    ],
  },
  {
    key: "money",
    items: [
      { key: "cod", href: "/admin/cod", permission: "cod:reconcile" },
      { key: "tabs", href: "/admin/tabs", permission: "cod:reconcile" },
      { key: "refunds", href: "/super-admin/refunds", permission: "refund:write" },
      { key: "offers", href: "/super-admin/promotions", permission: "promotion:write" },
      { key: "analytics", href: "/admin/analytics", permission: "analytics:read" },
    ],
  },
  {
    key: "schools",
    items: [
      { key: "schools", href: "/super-admin/schools", permission: "settings:write" },
      { key: "quotations", href: "/super-admin/quotations", permission: "settings:write" },
    ],
  },
  {
    key: "setup",
    folded: true,
    items: [
      { key: "settings", href: "/super-admin", permission: "settings:write" },
      { key: "staff", href: "/super-admin/staff", permission: "staff:manage" },
      { key: "approvals", href: "/super-admin/approvals", permission: "approval:review", count: "approvals" },
      { key: "audit", href: "/super-admin/audit", permission: "audit:read" },
    ],
  },
  {
    key: "delivery",
    items: [
      {
        key: "deliveries",
        href: "/delivery",
        permission: "delivery:assigned",
        count: "deliveries",
        also: ["/delivery/orders"],
      },
    ],
  },
];

/** The groups this person can use, each holding only the pages they're allowed to open. */
export function navFor(roles: readonly Role[]): StaffNavGroup[] {
  return STAFF_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(roles, item.permission)),
  })).filter((group) => group.items.length > 0);
}

const roots = new Set<string>(STAFF_ROOTS);
/** True when this menu entry is the page being shown (or one of its sub-pages). */
export function isActiveHref(item: Pick<StaffNavItem, "href" | "also">, pathname: string) {
  return (
    item.href === pathname ||
    (!roots.has(item.href) && pathname.startsWith(`${item.href}/`)) ||
    (item.href === "/admin" && pathname.startsWith("/admin/orders/")) ||
    (item.also ?? []).some((sibling) => sibling === pathname || pathname.startsWith(`${sibling}/`))
  );
}
