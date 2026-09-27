"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Grid2X2, ShoppingBag, UserRound } from "lucide-react";
import { copy, type Locale } from "@/lib/locale-types";
import { useBasket } from "./basket";
export function MobileNav({ locale }: { locale: Locale }) {
  const { count } = useBasket();
  const pathname = usePathname();
  const text = copy[locale];
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {[
        { href: "/", label: text.home, Icon: House },
        { href: "/catalog", label: text.explore, Icon: Grid2X2 },
        { href: "/cart", label: text.basket, Icon: ShoppingBag },
        { href: "/account", label: text.you, Icon: UserRound },
      ].map(({ href, label, Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname.startsWith(href) ||
              (href === "/catalog" && pathname.startsWith("/products")) ||
              // the staff workspace is reached from the account tab
              (href === "/account" && /^\/(admin|super-admin|delivery)(\/|$)/.test(pathname));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon size={21} />
              {href === "/cart" && count > 0 && (
                <b className="nav-count">{count}</b>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
