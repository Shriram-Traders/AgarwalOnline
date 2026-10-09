"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Grid2X2, Heart, ShoppingBag, UserRound } from "lucide-react";
import { copy, type Locale } from "@/lib/locale-types";
import { useBasket } from "./basket";

/**
 * The phone's floating tab bar. Every tab shows its icon and its name and keeps its place; the
 * one you're on gets a tinted pill. The basket is a tab like the others: the sticky basket bar
 * above it is the action.
 */
export function MobileNav({ locale, unread = 0 }: { locale: Locale; unread?: number }) {
  const { count } = useBasket();
  const pathname = usePathname();
  const text = copy[locale];
  // With the basket bar showing, the tab bar steps aside while you scroll down and comes back
  // when you scroll up, like a tab bar with an accessory in iOS. Keyboard focus brings it back.
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      const barShowing = Boolean(document.querySelector(".cart-bar")?.getClientRects().length);
      root.toggleAttribute("data-tabs-away", y > last && y > 120 && barShowing);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute("data-tabs-away");
    };
  }, [pathname]);
  return (
    <nav
      className="mobile-nav"
      aria-label="Mobile navigation"
      onFocus={() => document.documentElement.removeAttribute("data-tabs-away")}
    >
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
            aria-current={active ? "page" : undefined}
            aria-label={href === "/account" && unread > 0 ? `${label}, ${unread} ${text.notifications.toLowerCase()}` : undefined}
          >
            <span className="nav-icon">
              <Icon size={21} aria-hidden="true" />
              {basket && count > 0 && (
                <b className="nav-count" aria-hidden="true">
                  {count}
                </b>
              )}
              {href === "/account" && unread > 0 && (
                <b className="nav-count unread-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</b>
              )}
            </span>
            <span className="nav-label">{label}</span>
            {basket && count > 0 && <span className="sr-only">, {count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
