"use client";
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";

export type MenuLink = { href: string; label: string };

/**
 * Top-right account menu: just the person icon, with the name for screen readers and on hover.
 * A native <details>, so it opens without JavaScript; JS only closes it.
 */
export function AccountMenu({
  label,
  name,
  phone,
  email,
  links,
  workspace,
  workspaceLabel,
  signOutLabel,
  extra,
}: {
  /** "My account", in the shopper’s language. */
  label: string;
  name: string;
  phone?: string;
  email?: string;
  links: MenuLink[];
  workspace: MenuLink[];
  workspaceLabel: string;
  signOutLabel: string;
  /** Shown above Sign out, e.g. the language switch on staff pages, which have no top strip. */
  extra?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const firstName = name.split(" ")[0];
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const menu = ref.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const menu = ref.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <details ref={ref} className="account-menu">
      <summary title={`${label} · ${firstName}`}>
        <UserRound size={20} aria-hidden="true" />
        <span className="sr-only">
          {label}, {firstName}
        </span>
      </summary>
      <div className="account-menu-panel">
        <p className="account-menu-name">
          {name}
          <small>{phone ? `+91 ••••••${phone.slice(-4)}` : email}</small>
        </p>
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
        {workspace.length > 0 && (
          <>
            <span className="account-menu-label">{workspaceLabel}</span>
            <ul>
              {workspace.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {extra && <div className="account-menu-extra">{extra}</div>}
        <form action={logoutAction}>
          <button className="account-menu-signout">
            <LogOut size={16} aria-hidden="true" />
            {signOutLabel}
          </button>
        </form>
      </div>
    </details>
  );
}
