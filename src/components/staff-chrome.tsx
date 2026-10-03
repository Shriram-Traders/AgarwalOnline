"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Store, UserRound } from "lucide-react";
import { hasPermission, rolesFor, staffHome, type StaffRole } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";
import { copy, type Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import { navFor } from "@/lib/staff/nav";
import { HashTarget } from "./hash-target";
import { LocaleToggle } from "./locale-toggle";
import { Modal } from "./modal";
import { StaffCountsProvider } from "./staff-counts";
import { StaffFinder } from "./staff-finder";
import { StaffHeader, type StaffUser } from "./staff-header";
import { StaffNav } from "./staff-nav";
import { StaffTabs } from "./staff-tabs";

type Sheet = "more" | "search";

/** True while the person is typing somewhere, so "/" types a slash instead of opening search. */
function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Everything around a staff page: the staff header with its search, the grouped menu, the
 * footer, and on phones the staff tab bar with its Search and More sheets. Loaded only for staff.
 */
export default function StaffChrome({
  role,
  user,
  locale,
  footer,
  children,
}: {
  role: StaffRole;
  user: StaffUser;
  locale: Locale;
  footer: ReactNode;
  children: ReactNode;
}) {
  const roles = useMemo(() => rolesFor(role), [role]);
  const groups = useMemo(() => navFor(roles), [roles]);
  const text = staffCopy[locale];
  const shop = copy[locale];
  const pathname = usePathname();
  const delivery = role === "delivery";
  const finderInput = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  // a sheet belongs to the page it was opened on, so it's gone after moving to another page
  const [sheet, setSheet] = useState<{ kind: Sheet; at: string } | null>(null);
  const open = sheet?.at === pathname ? sheet.kind : null;
  const close = () => setSheet(null);

  // Ctrl+K or ⌘K from anywhere, or "/" when not typing: jump to the search
  useEffect(() => {
    if (delivery) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut =
        ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") ||
        (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target));
      if (!shortcut || document.querySelector('[aria-modal="true"], [role="alertdialog"]')) return;
      event.preventDefault();
      const input = finderInput.current;
      if (input && input.offsetParent !== null) input.focus();
      else setSheet({ kind: "search", at: window.location.pathname });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [delivery]);

  return (
    <StaffCountsProvider>
      <StaffHeader
        locale={locale}
        home={staffHome(roles) ?? "/"}
        user={user}
        bell={!delivery}
        finder={
          delivery ? null : <StaffFinder roles={roles} locale={locale} variant="popover" inputRef={finderInput} />
        }
      />
      <main id="main">
        <div className="workspace-layout">
          <StaffNav groups={groups} locale={locale} />
          <div className="workspace-main">{children}</div>
        </div>
      </main>
      {footer}
      <StaffTabs
        locale={locale}
        delivery={delivery}
        chats={hasPermission(roles, "chat:support")}
        onSearch={() => setSheet({ kind: "search", at: pathname })}
        onMore={() => setSheet({ kind: "more", at: pathname })}
      />
      {open === "search" && (
        <Modal title={text.search.label} onClose={close} closeLabel={text.sheet.close} variant="full" initialFocus={sheetInput}>
          <StaffFinder roles={roles} locale={locale} variant="inline" inputRef={sheetInput} onPick={close} />
        </Modal>
      )}
      {open === "more" && (
        <Modal title={delivery ? text.tabs.account : text.sheet.more} onClose={close} closeLabel={text.sheet.close}>
          <div className="more-sheet">
            {!delivery && <StaffNav groups={groups} locale={locale} variant="sheet" onNavigate={close} />}
            <ul className="more-sheet-links">
              <li>
                <Link href="/account" onClick={close}>
                  <UserRound size={18} aria-hidden="true" />
                  {shop.account}
                </Link>
              </li>
              <li>
                <Link href="/" onClick={close}>
                  <Store size={18} aria-hidden="true" />
                  {text.viewShop}
                </Link>
              </li>
            </ul>
            <div className="more-sheet-language">
              <span>{text.sheet.language}</span>
              <LocaleToggle locale={locale} />
            </div>
            <form action={logoutAction}>
              <button className="secondary-button more-sheet-signout">
                <LogOut size={16} aria-hidden="true" />
                {shop.signOut}
              </button>
            </form>
          </div>
        </Modal>
      )}
      <HashTarget />
    </StaffCountsProvider>
  );
}
