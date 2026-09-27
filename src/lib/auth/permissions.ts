export const roles = ["customer", "delivery", "admin", "super-admin"] as const;
export type Role = (typeof roles)[number];
/** Everyone holds "customer"; at most one of these is added on top. */
export const staffRoles = ["delivery", "admin", "super-admin"] as const;
export type StaffRole = (typeof staffRoles)[number];
export const grants = {
  customer: [
    "profile:own",
    "order:own",
    "cart:own",
    "chat:own",
    "complaint:own",
  ],
  delivery: ["profile:own", "delivery:assigned", "cod:collect"],
  admin: [
    "profile:own",
    "catalog:write",
    "inventory:adjust",
    "order:manage",
    "packing:write",
    "delivery:assign",
    "cod:reconcile",
    "chat:support",
    "complaint:manage",
    "approval:request",
    "analytics:read",
    "review:moderate",
  ],
  "super-admin": [
    "profile:own",
    "catalog:write",
    "inventory:adjust",
    "order:manage",
    "packing:write",
    "delivery:assign",
    "cod:reconcile",
    "chat:support",
    "complaint:manage",
    "approval:request",
    "analytics:read",
    "approval:review",
    "settings:write",
    "staff:manage",
    "audit:read",
    "refund:write",
    "promotion:write",
    "review:moderate",
  ],
} as const satisfies Record<Role, readonly string[]>;
export type Permission = (typeof grants)[Role][number];
export function hasPermission(userRoles: readonly Role[], permission: Permission) {
  return userRoles.some((role) =>
    (grants[role] as readonly string[]).includes(permission),
  );
}
export function assertPermission(userRoles: readonly Role[], permission: Permission) {
  if (!hasPermission(userRoles, permission)) throw new Error("FORBIDDEN");
}
/** The staff role a user holds, if any. */
export function staffRoleOf(userRoles: readonly Role[]): StaffRole | null {
  return (
    (["super-admin", "admin", "delivery"] as const).find((role) =>
      userRoles.includes(role),
    ) ?? null
  );
}
/** Where a staff member's workspace opens, or null for a plain customer. Owners start on the day's orders too. */
export function staffHome(userRoles: readonly Role[]) {
  const role = staffRoleOf(userRoles);
  return role === "super-admin" || role === "admin" ? "/admin" : role === "delivery" ? "/delivery" : null;
}
/** The full roles array for a person with this staff role (or none). */
export function rolesFor(staffRole: StaffRole | null): Role[] {
  return staffRole ? ["customer", staffRole] : ["customer"];
}
