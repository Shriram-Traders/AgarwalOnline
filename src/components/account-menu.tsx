"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";

export type MenuLink = { href: string; label: string };

/** Top-right account menu. A native <details>, so it opens without JavaScript; JS only closes it. */
export function AccountMenu({
  name,
  phone,
  email,
  links,
  workspace,
  workspaceLabel,
  signOutLabel,
}: {
  name: string;
  phone?: string;
  email?: string;
  links: MenuLink[];
  workspace: MenuLink[];
  workspaceLabel: string;
  signOutLabel: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
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
      <summary>
        <UserRound size={20} aria-hidden="true" />
        <span>{name.split(" ")[0]}</span>
        <ChevronDown size={14} aria-hidden="true" />
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
