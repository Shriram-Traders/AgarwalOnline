"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth/permissions";
import {
  Activity,
  BadgeIndianRupee,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  Headphones,
  LayoutDashboard,
  MessageSquareWarning,
  Settings,
  Sparkles,
  Star,
  Truck,
  UserCog,
  UsersRound,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
  /** Sibling routes that should keep this entry highlighted. */
  also?: string[];
};
type NavGroup = { label: string; items: NavItem[] };

const operations: NavGroup = {
  label: "Run the store",
  items: [
    { href: "/admin", label: "Overview & orders", icon: LayoutDashboard },
    {
      href: "/admin/products",
      label: "Catalog & stock",
      icon: Boxes,
      also: ["/admin/categories", "/admin/inventory"],
    },
    { href: "/admin/customers", label: "Customers", icon: UsersRound },
    { href: "/admin/cod", label: "Cash on delivery", icon: BadgeIndianRupee },
    { href: "/admin/support", label: "Support chats", icon: Headphones },
    { href: "/admin/complaints", label: "Complaints & returns", icon: MessageSquareWarning },
    { href: "/admin/reviews", label: "Reviews", icon: Star },
    { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  ],
};
const owner: NavGroup = {
  label: "Owner",
  items: [
    { href: "/super-admin", label: "Store settings", icon: Settings },
    { href: "/super-admin/staff", label: "Staff & roles", icon: UserCog },
    { href: "/super-admin/approvals", label: "Approvals", icon: ClipboardCheck },
    { href: "/super-admin/promotions", label: "Offers", icon: Sparkles },
    { href: "/super-admin/refunds", label: "Refunds", icon: BadgeIndianRupee },
    { href: "/super-admin/audit", label: "Audit trail", icon: Activity },
  ],
};
const delivery: NavGroup = {
  label: "Delivery",
  items: [{ href: "/delivery", label: "My deliveries", icon: Truck }],
};
const roots = new Set(["/admin", "/super-admin", "/delivery"]);

/**
 * Staff pages live inside the same storefront header and footer that shoppers
 * see; only a light workspace menu is added beside the page. The owner's menu
 * shows both groups because owners also run the day's orders.
 */
export function AdaptiveShell({
  header,
  footer,
  staffRole,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  staffRole: StaffRole | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStaff = Boolean(staffRole) && ["/admin", "/super-admin", "/delivery"].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
  const groups =
    staffRole === "super-admin" ? [operations, owner] : staffRole === "admin" ? [operations] : [delivery];
  return (
    <>
      {header}
      <main id="main">
        {isStaff ? (
          <div className="workspace-layout">
            <nav aria-label="Staff workspace" className="workspace-nav">
              {groups.map((group) => (
                <div className="workspace-group" key={group.label}>
                  <span className="workspace-group-label">{group.label}</span>
                  {group.items.map(({ href, label, icon: Icon, also }) => {
                    const active =
                      href === pathname ||
                      (!roots.has(href) && pathname.startsWith(`${href}/`)) ||
                      (href === "/admin" && pathname.startsWith("/admin/orders/")) ||
                      (also ?? []).some(
                        (sibling) => sibling === pathname || pathname.startsWith(`${sibling}/`),
                      );
                    return (
                      <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="workspace-main">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
      {footer}
    </>
  );
}
