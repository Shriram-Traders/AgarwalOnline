"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/locale-types";
import { isStaffPath } from "@/lib/staff/paths";
import { isSchoolPath } from "@/lib/schools/paths";
import type { StaffUser } from "./staff-header";

// shoppers never download the staff header, menu and search
const StaffChrome = dynamic(() => import("./staff-chrome"));

/**
 * Shop pages get the storefront header; staff pages get their own header, search and menu
 * (see StaffChrome); the school marketplace gets its own from its layout. The root layout
 * doesn't re-render on navigation, so the choice is made here from the path, which changes as
 * people move between the shop, the school marketplace and the workspace.
 */
export function AdaptiveShell({
  header,
  footer,
  staffRole,
  staffUser,
  locale,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  staffRole: StaffRole | null;
  staffUser: StaffUser | null;
  locale: Locale;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (staffRole && staffUser && isStaffPath(pathname))
    return (
      <StaffChrome role={staffRole} user={staffUser} locale={locale} footer={footer}>
        {children}
      </StaffChrome>
    );
  // the school marketplace brings its own header, main and tab bar (src/app/school/layout.tsx)
  if (isSchoolPath(pathname))
    return (
      <>
        {children}
        {footer}
      </>
    );
  return (
    <>
      {header}
      <main id="main">{children}</main>
      {footer}
    </>
  );
}
