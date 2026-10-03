/** The three staff areas. Everything at or under these paths is a staff page. */
export const STAFF_ROOTS = ["/admin", "/super-admin", "/delivery"] as const;

export function isStaffPath(pathname: string) {
  return STAFF_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
