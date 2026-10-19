import Link from "next/link";
import { ArrowRight, Bell, ChevronDown, Heart, MapPin, School, UserRound } from "lucide-react";
import { SmartSearch } from "./smart-search";
import { MobileNav } from "./mobile-nav";
import { LocaleToggle } from "./locale-toggle";
import { AccountMenu, type MenuLink } from "./account-menu";
import { staffRoleOf, type Role } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/session";
import { PromotionRedemption } from "@/lib/promotions/models";
import { liveOffers, runningAt } from "@/lib/promotions/service";
import { Notification } from "@/lib/engagement/models";
import { deliveryRules } from "@/lib/commerce/service";
import { CartBar } from "./cart-bar";
import { ShopAssistant } from "./shop-assistant";
import { shopAssistantEnabled } from "@/lib/assistant/flags";
import { BackButton } from "./back-button";
import { BasketLink } from "./basket";
import { formatPrice } from "@/lib/display";
import { representsActiveSchool } from "@/lib/schools/membership";
import { schoolCopy } from "@/lib/schools/copy";
import { copy, type Locale } from "@/lib/locale-types";
import { pendingFeedbackOrder } from "@/lib/feedback/service";
import { FeedbackPrompt } from "./feedback-prompt";
import { shopSettings, words } from "@/lib/settings/shop";

export type CategoryLink = { slug: string; en: string; mr: string };

/** Staff see their workspace in the account menu instead of using a separate sign-in. */
function workspaceLinks(
  roles: readonly Role[],
  text: { operations: string; governance: string; deliveries: string },
): MenuLink[] {
  const role = staffRoleOf(roles);
  if (role === "super-admin")
    return [
      { href: "/admin", label: text.operations },
      { href: "/super-admin", label: text.governance },
    ];
  if (role === "admin") return [{ href: "/admin", label: text.operations }];
  if (role === "delivery") return [{ href: "/delivery", label: text.deliveries }];
  return [];
}


export async function Header({
  locale,
  categories,
  offers = false,
}: {
  locale: Locale;
  categories: CategoryLink[];
  /** Something sells below MRP: without it the Offers page would list everything at full price. */
  offers?: boolean;
}) {
  const now = new Date();
  const [user, rules, offer, front] = await Promise.all([
    currentUser(),
    deliveryRules(),
    // only the coupon the owner picked as the welcome offer; any live code used to be advertised
    liveOffers().then((offers) => offers.find((o) => o.welcome && o.code && runningAt(now)(o)) ?? null),
    shopSettings("storefront"),
  ]);
  // the owners' announcement (Customize → Shop front): shown while switched on and written
  const announcement = front.announcementOn ? words(front.announcement, locale, front.announcement.en) : "";
  // staff accounts aren't asked to rate: their test orders would skew the shop's scores
  const shopper = user && !staffRoleOf(user.roles) ? user : null;
  // all four depend on who's signed in, not on each other: ask at the same time
  const [usedWelcome, schoolMember, toRate, unread] = user
    ? await Promise.all([
        offer ? PromotionRedemption.exists({ promotionId: offer._id, customerId: user.id }) : null,
        // a paused school has nothing to open, so it doesn't count
        representsActiveSchool(user.id, user.roles),
        // a delivered order waiting for "How did we do?"; never worth failing the page over
        shopper ? pendingFeedbackOrder(shopper.id).catch(() => null) : null,
        Notification.countDocuments({ userId: user.id, readAt: null }),
      ])
    : [null, null, null, 0];
  // someone who already used it isn't told about it again
  const welcome = usedWelcome ? null : offer;
  const text = copy[locale];
  const workspace = workspaceLinks(user?.roles ?? [], text);
  // representatives of a school get a way into its quotation area
  const representsSchool = Boolean(schoolMember);
  // the owner shops for any school, so it isn't "my" school
  const schoolDoor =
    staffRoleOf(user?.roles ?? []) === "super-admin" ? schoolCopy[locale].forSchools : schoolCopy[locale].forMySchool;
  // the first five aisles in the shop's order (AISLE_ORDER in catalog/queries.ts)
  const nav = categories.slice(0, 5);
  const cutoff = `${rules.cutoffHour % 12 || 12} ${rules.cutoffHour >= 12 ? "PM" : "AM"}`;
  return (
    <>
      {announcement && (
        <p className="announcement-bar" role="note">
          {announcement}
        </p>
      )}
      <div className="top-strip">
        <div className="top-strip-inner">
          <p>
            {front.showFreeDelivery && <span>{text.freeFrom(formatPrice(rules.freeThresholdPaise))}</span>}
            {front.showWelcome && welcome?.code && (
              <>
                {front.showFreeDelivery && <span aria-hidden="true">·</span>}
                <span>
                  <span className="welcome-long">
                    {text.welcomeCode(welcome.minimumSubtotalPaise ? formatPrice(welcome.minimumSubtotalPaise) : "")}
                  </span>
                  <span className="welcome-short">
                    {text.welcomeShort(welcome.minimumSubtotalPaise ? formatPrice(welcome.minimumSubtotalPaise) : "")}
                  </span>{" "}
                  <span className="offer-code">{welcome.code}</span>
                </span>
              </>
            )}
          </p>
          <div className="top-strip-links">
            {representsSchool && (
              // phones only: the category row with the desktop button is hidden there
              <Link href="/school" className="school-door">
                <School size={14} aria-hidden="true" /> <span className="school-door-label">{schoolDoor}</span>
              </Link>
            )}
            {front.showSameDay && (
              <Link href="/serviceability">
                {text.sameDay(cutoff)} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
            <LocaleToggle locale={locale} />
          </div>
        </div>
      </div>
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Agarwal Online, home">
            Agarwal<small>Online</small>
          </Link>
          <nav className="primary-nav" aria-label={text.shopByCategory}>
            {/* desktop and tablet: first in the category row; phones get the one beside search */}
            <BackButton label={text.back} className="nav-back" />
            <Link href="/catalog">{text.all}</Link>
            {nav.map((category) => (
              <Link key={category.slug} href={`/catalog?category=${category.slug}`}>
                {category[locale]}
              </Link>
            ))}
            {offers && (
              <Link href="/catalog?sort=discount" className="offers">
                {text.deals}
              </Link>
            )}
            {representsSchool && (
              <Link href="/school" className="school-door-pill">
                <School size={16} aria-hidden="true" /> {schoolDoor}
              </Link>
            )}
          </nav>
          {/* logo → where we deliver → search → icons; phones put the icons in the bottom bar */}
          <div className="header-actions">
            <Link href="/serviceability" className="location">
              <small>{text.promise(cutoff)}</small>
              <MapPin size={18} aria-hidden="true" />
              <strong>
                <span>{text.area}</span> <ChevronDown size={14} aria-hidden="true" />
              </strong>
            </Link>
            <BackButton label={text.back} className="search-back" />
            <SmartSearch placeholder={text.searchPlaceholder} hints={[...text.searchHints]} />
            <div className="header-icons">
              {user && (
                <Link
                  href="/account/notifications"
                  className="header-action header-bell"
                  aria-label={unread ? `${text.notifications}, ${unread}` : text.notifications}
                >
                  <Bell size={20} aria-hidden="true" />
                  {unread > 0 && <b className="nav-count unread-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</b>}
                </Link>
              )}
              {user ? (
                <AccountMenu
                  label={text.account}
                  name={user.name}
                  phone={user.phone}
                  email={user.email}
                  links={[
                    { href: "/account", label: text.account },
                    { href: "/account/orders", label: text.orders },
                    { href: "/account/wishlist", label: text.saved },
                    { href: "/account/notifications", label: text.notifications },
                    { href: "/account/support", label: text.support },
                    ...(representsSchool ? [{ href: "/school", label: text.school }] : []),
                  ]}
                  workspace={workspace}
                  workspaceLabel={text.workspace}
                  signOutLabel={text.signOut}
                />
              ) : (
                <Link href="/login" className="header-action" title={text.signIn}>
                  <UserRound size={20} aria-hidden="true" />
                  <span className="sr-only">{text.signIn}</span>
                </Link>
              )}
              <Link href="/account/wishlist" className="header-action" title={text.saved}>
                <Heart size={20} aria-hidden="true" />
                <span className="sr-only">{text.saved}</span>
              </Link>
              <BasketLink label={text.basket} />
            </div>
          </div>
        </div>
      </header>
      <MobileNav locale={locale} unread={unread} />
      <CartBar locale={locale} />
      {shopper && <FeedbackPrompt order={toRate} locale={locale} />}
      {/* hidden until the store introduces it: SHOP_ASSISTANT=on */}
      {shopAssistantEnabled() && <ShopAssistant locale={locale} signedIn={Boolean(user)} />}
    </>
  );
}
