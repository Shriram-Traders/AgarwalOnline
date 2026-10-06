import Link from "next/link";
import { ArrowUpRight, ChevronDown, Heart, MapPin, School, UserRound } from "lucide-react";
import { SmartSearch } from "./smart-search";
import { MobileNav } from "./mobile-nav";
import { LocaleToggle } from "./locale-toggle";
import { AccountMenu, type MenuLink } from "./account-menu";
import { staffRoleOf, type Role } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/session";
import { Promotion, PromotionRedemption } from "@/lib/promotions/models";
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
  const [user, rules, offer] = await Promise.all([
    currentUser(),
    deliveryRules(),
    // only the coupon the owner picked as the welcome offer; any live code used to be advertised
    Promotion.findOne({
      active: true,
      welcome: true,
      code: { $type: "string", $ne: "" },
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    }).select("code minimumSubtotalPaise"),
  ]);
  // staff accounts aren't asked to rate: their test orders would skew the shop's scores
  const shopper = user && !staffRoleOf(user.roles) ? user : null;
  // all three depend on who's signed in, not on each other: ask at the same time
  const [usedWelcome, schoolMember, toRate] = user
    ? await Promise.all([
        offer ? PromotionRedemption.exists({ promotionId: offer._id, customerId: user.id }) : null,
        // a paused school has nothing to open, so it doesn't count
        representsActiveSchool(user.id),
        // a delivered order waiting for "How did we do?"; never worth failing the page over
        shopper ? pendingFeedbackOrder(shopper.id).catch(() => null) : null,
      ])
    : [null, null, null];
  // someone who already used it isn't told about it again
  const welcome = usedWelcome ? null : offer;
  const text = copy[locale];
  const workspace = workspaceLinks(user?.roles ?? [], text);
  // representatives of a school get a way into its quotation area
  const representsSchool = Boolean(schoolMember);
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
                  {text.welcomeCode(welcome.minimumSubtotalPaise ? formatPrice(welcome.minimumSubtotalPaise) : "")}{" "}
                  <span className="offer-code">{welcome.code}</span>
                </span>
              </>
            )}
          </p>
          <div className="top-strip-links">
            {representsSchool && (
              // phones only: the category row with the desktop button is hidden there
              <Link href="/school" className="school-door">
                <School size={14} aria-hidden="true" /> {schoolCopy[locale].forMySchool}
              </Link>
            )}
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
            {/* desktop and tablet: first in the category row; phones get the one beside search */}
            <BackButton label={text.back} className="nav-back" />
            <Link href="/catalog">{text.all}</Link>
            {nav.map((category) => (
              <Link key={category.slug} href={`/catalog?category=${category.slug}`}>
                {category[locale]}
              </Link>
            ))}
            <Link href="/catalog?sort=discount" className="offers">
              {text.deals}
            </Link>
            {representsSchool && (
              <Link href="/school" className="school-door-pill">
                <School size={16} aria-hidden="true" /> {schoolCopy[locale].forMySchool}
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
      <MobileNav locale={locale} />
      <CartBar locale={locale} />
      {shopper && <FeedbackPrompt order={toRate} locale={locale} />}
      {/* hidden until the store introduces it: SHOP_ASSISTANT=on */}
      {shopAssistantEnabled() && <ShopAssistant locale={locale} signedIn={Boolean(user)} />}
    </>
  );
}
