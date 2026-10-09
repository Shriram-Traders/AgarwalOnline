"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Grid2X2, House, ShoppingBag, UserRound } from "lucide-react";
import type { Locale } from "@/lib/locale-types";
import { schoolCopy } from "@/lib/schools/copy";

/**
 * The phone's tab bar in the school marketplace, the same floating capsule as the shop's:
 * the school home, its aisles, the shared basket as the solid button, quotations and you.
 */
export function SchoolTabs({ locale, basketLines }: { locale: Locale; basketLines: number }) {
  const pathname = usePathname();
  const text = schoolCopy[locale];
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const tabs = [
    { href: "/school", label: text.tabHome, Icon: House, active: pathname === "/school" },
    {
      href: "/school/catalog",
      label: text.tabAisles,
      Icon: Grid2X2,
      active: under("/school/catalog") || under("/school/products"),
    },
    {
      href: "/school/basket",
      label: text.basket,
      Icon: ShoppingBag,
      active: under("/school/basket") || under("/school/checkout"),
      basket: true,
    },
    { href: "/school/quotations", label: text.quotations, Icon: FileText, active: under("/school/quotations") },
    { href: "/account", label: text.tabYou, Icon: UserRound, active: false },
  ];
  return (
    <nav className="mobile-nav school-tabs-bar" aria-label={text.navLabel}>
      {tabs.map(({ href, label, Icon, active, basket }) => (
        <Link
          key={href}
          href={href}
          className={basket ? "nav-basket" : undefined}
          aria-current={active ? "page" : undefined}
        >
          <span className="nav-icon">
            <Icon size={21} aria-hidden="true" />
            {basket && basketLines > 0 && (
              <b className="nav-count" aria-hidden="true">
                {basketLines}
              </b>
            )}
            <span className="nav-label">{label}</span>
          </span>
          {basket && basketLines > 0 && <span className="sr-only">, {basketLines}</span>}
        </Link>
      ))}
    </nav>
  );
}
