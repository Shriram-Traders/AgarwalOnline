"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Grid2X2, Heart, ShoppingBag, UserRound } from "lucide-react";
import { copy, type Locale } from "@/lib/locale-types";
import { useBasket } from "./basket";

/**
 * The phone's floating tab bar. Tabs are icons; the one you're on grows into a pill with its
 * name, and the basket sits in the middle as the one solid button. Every tab keeps its name for
 * screen readers, so "Basket" or "You" can always be found by name.
 */
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
        { href: "/account/wishlist", label: text.saved, Icon: Heart },
        { href: "/account", label: text.you, Icon: UserRound },
      ].map(({ href, label, Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : href === "/account"
              ? // the wishlist has its own tab; staff pages and the school marketplace have their own tab bars
                pathname.startsWith("/account") && !pathname.startsWith("/account/wishlist")
              : pathname.startsWith(href) || (href === "/catalog" && pathname.startsWith("/products"));
        const basket = href === "/cart";
        return (
          <Link
            key={href}
            href={href}
            className={basket ? "nav-basket" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon size={21} aria-hidden="true" />
              {basket && count > 0 && (
                <b className="nav-count" aria-hidden="true">
                  {count}
                </b>
              )}
              <span className="nav-label">{label}</span>
            </span>
            {basket && count > 0 && <span className="sr-only">, {count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
