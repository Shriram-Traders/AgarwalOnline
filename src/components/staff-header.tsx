"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Store } from "lucide-react";
import { copy, type Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import { AccountMenu } from "./account-menu";
import { BackButton } from "./back-button";
import { LocaleToggle } from "./locale-toggle";
import { highlightTarget } from "./hash-target";
import { useStaffCounts } from "./staff-counts";

export type StaffUser = { name: string; phone?: string; email?: string };

/**
 * The staff pages' own header: no aisles, location, wishlist or basket. The logo leads home to
 * the workspace, the search finds settings and pages, and the bell counts what's waiting.
 */
export function StaffHeader({
  locale,
  home,
  user,
  finder,
  bell,
}: {
  locale: Locale;
  home: string;
  user: StaffUser;
  finder: ReactNode;
  /** Owners and admins get the bell; delivery partners see their stops on their own page. */
  bell: boolean;
}) {
  const text = staffCopy[locale];
  const shop = copy[locale];
  const { needsYou } = useStaffCounts();
  return (
    <header className="header staff-header">
      <div className="staff-header-inner">
        <BackButton label={shop.back} className="staff-back" />
        <Link href={home} className="brand staff-brand" aria-label={text.home}>
          Agarwal<small>{text.workspace}</small>
        </Link>
        {finder}
        <div className="staff-header-actions">
          <Link href="/" className="view-shop" title={text.viewShop}>
            <Store size={18} aria-hidden="true" />
            <span>{text.viewShop}</span>
          </Link>
          {bell && (
            <Link
              href="/admin#needs-you"
              className="alerts-bell"
              title={text.alerts(needsYou)}
              onClick={() => highlightTarget("/admin#needs-you")}
            >
              <Bell size={20} aria-hidden="true" />
              {needsYou > 0 && (
                <b className="nav-count" aria-hidden="true">
                  {needsYou > 99 ? "99+" : needsYou}
                </b>
              )}
              <span className="sr-only">{text.alerts(needsYou)}</span>
            </Link>
          )}
          <AccountMenu
            label={shop.account}
            name={user.name}
            phone={user.phone}
            email={user.email}
            links={[
              { href: "/account", label: shop.account },
              { href: "/account/orders", label: shop.orders },
            ]}
            workspace={[]}
            workspaceLabel={shop.workspace}
            signOutLabel={shop.signOut}
            extra={<LocaleToggle locale={locale} />}
          />
        </div>
      </div>
    </header>
  );
}
