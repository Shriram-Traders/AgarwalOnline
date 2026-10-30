import Link from "next/link";
import { ChevronDown, School, ShoppingBag, Store, UserRound } from "lucide-react";
import { copy, type Locale } from "@/lib/locale-types";
import { schoolCopy } from "@/lib/schools/copy";
import { switchHref } from "@/lib/schools/access";
import { AccountMenu } from "./account-menu";
import { BackButton } from "./back-button";
import { LocaleToggle } from "./locale-toggle";
import { Popover } from "./popover";
import { SmartSearch } from "./smart-search";

type Aisle = { slug: string; en: string; mr: string };

/**
 * The school marketplace's own header, in the shop's look: logo "for schools", the school
 * being bought for (a switcher for people in several), a search of the school catalogue,
 * the account and the school's shared basket, and the school aisles underneath.
 */
export function SchoolHeader({
  locale,
  user,
  current,
  others,
  aisles,
  basketLines,
}: {
  locale: Locale;
  user: { name: string; phone?: string; email?: string } | null;
  /** The school being bought for; null before one is chosen, or for someone who isn't a representative. */
  current: { id: string; name: string } | null;
  /** Their other active schools, for the switcher. */
  others: { id: string; name: string }[];
  aisles: Aisle[];
  basketLines: number;
}) {
  const text = schoolCopy[locale];
  const shop = copy[locale];
  return (
    <>
      {/* the shop's own strip, with the way back where the shop puts the way in */}
      <div className="top-strip">
        <div className="top-strip-inner">
          <p>
            <span>{text.stripNote}</span>
          </p>
          <div className="top-strip-links">
            {/* phones only: the menu row with the desktop button is hidden there */}
            <Link href="/" className="school-door">
              <Store size={14} aria-hidden="true" /> {text.backToShop}
            </Link>
            <LocaleToggle locale={locale} />
          </div>
        </div>
      </div>
    <header className="header school-header">
      <div className="header-inner">
        <Link href="/school" className="brand" aria-label={text.home}>
          Agarwal Online<small>{text.forSchools}</small>
        </Link>
        {/* as in the shop: the aisles scroll, the door back to the shop stays pinned at the end */}
        <div className="nav-row with-door">
          <nav className="primary-nav" aria-label={text.aislesLabel}>
            <BackButton label={shop.back} className="nav-back" />
            {current && (
              <>
                <Link href="/school/catalog">{text.allItems}</Link>
                {aisles.slice(0, 5).map((aisle) => (
                  <Link key={aisle.slug} href={`/school/catalog?category=${aisle.slug}`}>
                    {aisle[locale]}
                  </Link>
                ))}
                <Link href="/school/quotations">{text.quotations}</Link>
              </>
            )}
          </nav>
          <Link href="/" className="school-door-pill">
            <Store size={16} aria-hidden="true" /> {text.backToShop}
          </Link>
        </div>
        <div className="header-actions">
          {current ? (
            others.length ? (
              <Popover
                className="school-switch"
                label={`${text.schoolLabel(current.name)}. ${text.switchSchool}`}
                summary={
                  <span className="school-pill">
                    <School size={17} aria-hidden="true" />
                    <strong>{current.name}</strong>
                    <ChevronDown size={14} aria-hidden="true" />
                  </span>
                }
              >
                <p className="popover-title">{text.switchSchool}</p>
                <ul className="school-switch-list">
                  {others.map((school) => (
                    <li key={school.id}>
                      {/* a full page load: the header itself changes school */}
                      <a href={switchHref(school.id, "/school")}>{school.name}</a>
                    </li>
                  ))}
                </ul>
              </Popover>
            ) : (
              <Link href="/school" className="school-switch school-pill" title={text.schoolLabel(current.name)}>
                <School size={17} aria-hidden="true" />
                <strong>{current.name}</strong>
              </Link>
            )
          ) : (
            <span className="school-switch school-pill quiet">
              <School size={17} aria-hidden="true" />
              <strong>{text.forSchools}</strong>
            </span>
          )}
          <BackButton label={shop.back} className="search-back" />
          {current && (
            <SmartSearch
              placeholder={text.searchPlaceholder}
              hints={text.searchHints}
              label={text.searchLabel}
              action="/school/catalog"
              suggestUrl="/api/school/suggestions"
              productBase="/school/products/"
            />
          )}
          <div className="header-icons">
            {user ? (
              <AccountMenu
                label={shop.account}
                name={user.name}
                phone={user.phone}
                email={user.email}
                links={[
                  { href: "/account", label: shop.account },
                  ...(current ? [{ href: "/school/quotations", label: text.quotations }] : []),
                  { href: "/", label: text.shopForHome },
                ]}
                workspace={[]}
                workspaceLabel={shop.workspace}
                signOutLabel={shop.signOut}
                extra={<LocaleToggle locale={locale} />}
              />
            ) : (
              <Link href="/login?then=%2Fschool" className="header-action" title={shop.signIn}>
                <UserRound size={20} aria-hidden="true" />
                <span className="sr-only">{shop.signIn}</span>
              </Link>
            )}
            {current && (
              <Link href="/school/basket" className="cart-button" title={text.basket}>
                <ShoppingBag size={20} aria-hidden="true" />
                {basketLines > 0 && <b aria-hidden="true">{basketLines}</b>}
                <span className="sr-only">{basketLines ? text.basketCount(basketLines) : text.basket}</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
