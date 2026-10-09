import type { Permission } from "../auth/permissions";

/**
 * Who reads customers' ratings: the owner. The page, its menu entry, its count, its overview
 * queue and its search entries all use this, so opening it to the day-to-day team later is this
 * one line (e.g. "complaint:manage").
 */
export const FEEDBACK_PERMISSION: Permission = "settings:write";
