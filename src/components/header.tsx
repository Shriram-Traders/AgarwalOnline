import Link from "next/link";
import { ArrowUpRight, ChevronDown, MapPin, ShoppingBag, UserRound } from "lucide-react";
import { SmartSearch } from "./smart-search";
import { MobileNav } from "./mobile-nav";
import { LocaleToggle } from "./locale-toggle";
import { AccountMenu, type MenuLink } from "./account-menu";
import { staffRoleOf, type Role } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/session";
import { Promotion } from "@/lib/promotions/models";
import { cartFor, deliveryRules } from "@/lib/commerce/service";
import { CartBar } from "./cart-bar";
import { formatPrice } from "@/lib/display";
import { copy, type Locale } from "@/lib/locale-types";

export type CategoryLink = { slug: string; en: string; mr: string };

/** Staff see their workspace in the account menu instead of using a separate sign-in. */
function workspaceLinks(
  roles: readonly Role[],
  text: { operations: string; governance: string; deliveries: string },
): MenuLink[] {
  const role = staffRoleOf(roles);
  if (role === "super-admin")
    return [
      { href: "/super-admin", label: text.governance },
      { href: "/admin", label: text.operations },
    ];
  if (role === "admin") return [{ href: "/admin", label: text.operations }];
  if (role === "delivery") return [{ href: "/delivery", label: text.deliveries }];
  return [];
}

/** Primary navigation is a fixed set of aisle groups; labels come from the catalog. */
const NAV_SLUGS = ["stationery", "paper", "art-craft", "gift-sets", "gift-wrap"];

export async function Header({
  locale,
  categories,
}: {
  locale: Locale;
  categories: CategoryLink[];
}) {
  const now = new Date();
  const [user, rules, welcome] = await Promise.all([
    currentUser(),
    deliveryRules(),
    Promotion.findOne({
      active: true,
      code: { $type: "string", $ne: "" },
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    })
      .sort({ minimumSubtotalPaise: 1 })
      .select("code minimumSubtotalPaise"),
  ]);
  const text = copy[locale];
  const lines = user
    ? await cartFor(user.id)
    : await (await import("@/lib/commerce/guest-cart")).guestCartLines();
  const workspace = workspaceLinks(user?.roles ?? [], text);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  const nav = NAV_SLUGS.map((slug) => categories.find((c) => c.slug === slug)).filter(
    (c): c is CategoryLink => Boolean(c),
  );
  const cutoff = `${rules.cutoffHour % 12 || 12} ${rules.cutoffHour >= 12 ? "PM" : "AM"}`;
  return (
    <>
      <div className="top-strip">
        <div className="top-strip-inner">
          <p>
            <span>{text.freeFrom(formatPrice(rules.freeThresholdPaise))}</span>
            {welcome?.code && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {text.welcomeCode(formatPrice(welcome.minimumSubtotalPaise))}{" "}
                  <span className="offer-code">{welcome.code}</span>
                </span>
              </>
            )}
          </p>
          <div className="top-strip-links">
            <Link href="/serviceability">
              {text.sameDay(cutoff)} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <LocaleToggle locale={locale} />
          </div>
        </div>
      </div>
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Agarwal General Stores, home">
            Agarwal<small>General Stores</small>
          </Link>
          <nav className="primary-nav" aria-label={text.shopByCategory}>
            <Link href="/catalog">{text.all}</Link>
            {nav.map((category) => (
              <Link key={category.slug} href={`/catalog?category=${category.slug}`}>
                {category[locale]}
              </Link>
            ))}
            <Link href="/catalog?sort=discount" className="offers">
              {text.deals}
            </Link>
          </nav>
          <div className="header-actions">
            <SmartSearch placeholder={text.searchPlaceholder} hints={[...text.searchHints]} />
            <Link href="/serviceability" className="location">
              <small>{text.promise(cutoff)}</small>
              <MapPin size={18} aria-hidden="true" />
              <strong>
                <span>{text.area}</span> <ChevronDown size={14} aria-hidden="true" />
              </strong>
            </Link>
            {user ? (
              <AccountMenu
                name={user.name}
                phone={user.phone}
                links={[
                  { href: "/account", label: text.account },
                  { href: "/account/orders", label: text.orders },
                  { href: "/account/wishlist", label: text.wishlist },
                  { href: "/account/notifications", label: text.notifications },
                  { href: "/account/support", label: text.support },
                ]}
                workspace={workspace}
                workspaceLabel={text.workspace}
                signOutLabel={text.signOut}
              />
            ) : (
              <Link href="/login" className="header-action" aria-label={text.signIn}>
                <UserRound size={20} aria-hidden="true" />
                <span>{text.signIn}</span>
              </Link>
            )}
            <Link
              href="/cart"
              className="cart-button"
              aria-label={count > 0 ? `${text.basket}, ${count}` : text.basket}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span>{text.basket}</span>
              {count > 0 && <b aria-hidden="true">{count}</b>}
            </Link>
          </div>
        </div>
      </header>
      <MobileNav count={count} locale={locale} />
      <CartBar count={count} totalPaise={total} locale={locale} />
    </>
  );
}
