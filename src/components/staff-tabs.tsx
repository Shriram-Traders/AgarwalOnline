"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, LayoutDashboard, Menu, ReceiptText, Search, Truck, UserRound } from "lucide-react";
import type { Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import type { CountKey } from "@/lib/staff/types";
import { useStaffCounts } from "./staff-counts";

type Tab =
  | { kind: "link"; href: string; label: string; Icon: typeof Menu; active: boolean; count?: CountKey }
  | { kind: "button"; label: string; Icon: typeof Menu; onClick: () => void; dialog: boolean };

/**
 * The phone's bottom bar on staff pages, in place of the shopper's. Every tab keeps its name on
 * screen: the people using it are working fast, often one-handed.
 */
export function StaffTabs({
  locale,
  delivery,
  chats,
  onSearch,
  onMore,
}: {
  locale: Locale;
  /** A delivery partner's bar: their stops and their account. */
  delivery: boolean;
  /** Whether this person answers support chats. */
  chats: boolean;
  onSearch: () => void;
  onMore: () => void;
}) {
  const text = staffCopy[locale].tabs;
  const pathname = usePathname();
  const { counts } = useStaffCounts();
  const tabs: Tab[] = delivery
    ? [
        {
          kind: "link",
          href: "/delivery",
          label: text.deliveries,
          Icon: Truck,
          active: pathname === "/delivery" || pathname.startsWith("/delivery/"),
          count: "deliveries",
        },
        { kind: "button", label: text.account, Icon: UserRound, onClick: onMore, dialog: true },
      ]
    : [
        { kind: "link", href: "/admin", label: text.overview, Icon: LayoutDashboard, active: pathname === "/admin" },
        {
          kind: "link",
          href: "/admin#orders",
          label: text.orders,
          Icon: ReceiptText,
          active: pathname.startsWith("/admin/orders/"),
          count: "orders",
        },
        { kind: "button", label: text.search, Icon: Search, onClick: onSearch, dialog: true },
        ...(chats
          ? [
              {
                kind: "link" as const,
                href: "/admin/support",
                label: text.chats,
                Icon: Headphones,
                active: pathname.startsWith("/admin/support"),
                count: "chats" as const,
              },
            ]
          : []),
        { kind: "button", label: text.more, Icon: Menu, onClick: onMore, dialog: true },
      ];
  return (
    <nav className="mobile-nav staff-tabs" aria-label={text.label}>
      {tabs.map((tab) => {
        const count = tab.kind === "link" && tab.count ? (counts[tab.count] ?? 0) : 0;
        const inner = (
          <>
            <span className="nav-icon">
              <tab.Icon size={21} aria-hidden="true" />
              {count > 0 && (
                <b className="nav-count" aria-hidden="true">
                  {count > 99 ? "99+" : count}
                </b>
              )}
            </span>
            <span className="nav-label">{tab.label}</span>
            {count > 0 && <span className="sr-only"> ({staffCopy[locale].waiting(count)})</span>}
          </>
        );
        return tab.kind === "link" ? (
          <Link key={tab.label} href={tab.href} aria-current={tab.active ? "page" : undefined}>
            {inner}
          </Link>
        ) : (
          <button key={tab.label} type="button" aria-haspopup="dialog" onClick={tab.onClick}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
