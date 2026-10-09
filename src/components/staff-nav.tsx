"use client";
import { useId, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Headphones,
  LayoutDashboard,
  MessageSquareWarning,
  NotebookPen,
  ReceiptIndianRupee,
  School,
  Settings,
  Star,
  TicketPercent,
  Truck,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/locale-types";
import { staffCopy } from "@/lib/staff/copy";
import { isActiveHref, type StaffGroupKey, type StaffNavGroup, type StaffNavKey } from "@/lib/staff/nav";
import { useStaffCounts } from "./staff-counts";

export const NAV_ICONS: Record<StaffNavKey, LucideIcon> = {
  overview: LayoutDashboard,
  chats: Headphones,
  complaints: MessageSquareWarning,
  catalog: Boxes,
  customers: UsersRound,
  reviews: Star,
  cod: Banknote,
  tabs: NotebookPen,
  refunds: ReceiptIndianRupee,
  offers: TicketPercent,
  analytics: ChartNoAxesCombined,
  schools: School,
  quotations: FileText,
  settings: Settings,
  staff: UserCog,
  approvals: ClipboardCheck,
  audit: Activity,
  deliveries: Truck,
};

/** Which groups someone folded away, kept in this browser. Storage can be missing (private windows). */
const KEY = "ags-staff-groups";
const listeners = new Set<() => void>();
let memory: string | null = null;
function readFolds() {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeFolds(value: string) {
  memory = value;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // remembered for this visit only
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The staff menu: groups by job, with how many things wait beside each page. On a wide screen it's
 * the sidebar and its groups fold; in the phone's More sheet every page is listed.
 */
export function StaffNav({
  groups,
  locale,
  variant = "sidebar",
  onNavigate,
}: {
  groups: StaffNavGroup[];
  locale: Locale;
  variant?: "sidebar" | "sheet";
  onNavigate?: () => void;
}) {
  const text = staffCopy[locale];
  const pathname = usePathname();
  const { counts } = useStaffCounts();
  const id = useId();
  const stored = useSyncExternalStore(subscribe, readFolds, () => null);
  let folds: Partial<Record<StaffGroupKey, boolean>> = {};
  try {
    folds = stored ? JSON.parse(stored) : {};
  } catch {
    folds = {};
  }
  const foldable = variant === "sidebar" && groups.length > 1;
  const toggle = (key: StaffGroupKey, folded: boolean) => writeFolds(JSON.stringify({ ...folds, [key]: !folded }));
  return (
    <nav aria-label={text.navLabel} className={`workspace-nav${variant === "sheet" ? " is-sheet" : ""}`}>
      {groups.map((group) => {
        const label = text.groups[group.key];
        const here = group.items.some((item) => isActiveHref(item, pathname));
        const folded = foldable && !here && (folds[group.key] ?? group.folded ?? false);
        const waiting = group.items.reduce((sum, item) => sum + (item.count ? (counts[item.count] ?? 0) : 0), 0);
        const listId = `${id}-${group.key}`;
        return (
          <div className={`workspace-group${folded ? " is-collapsed" : ""}`} key={group.key}>
            {foldable ? (
              <div className="workspace-group-label">
                <button
                  type="button"
                  aria-expanded={!folded}
                  aria-controls={listId}
                  title={text.showGroup(label)}
                  onClick={() => toggle(group.key, folded)}
                >
                  <span>{label}</span>
                  {folded && waiting > 0 && (
                    <>
                      <b className="nav-badge" aria-hidden="true">
                        {waiting}
                      </b>
                      <span className="sr-only"> ({text.waiting(waiting)})</span>
                    </>
                  )}
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <span className="workspace-group-label">{label}</span>
            )}
            <ul className="workspace-group-items" id={listId}>
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.key];
                const count = item.count ? (counts[item.count] ?? 0) : 0;
                const active = isActiveHref(item, pathname);
                return (
                  <li key={item.key}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                      <Icon size={18} aria-hidden="true" />
                      <span>{text.nav[item.key]}</span>
                      {count > 0 && (
                        <>
                          <b className={`nav-badge${item.count === "lowStock" ? " is-quiet" : ""}`} aria-hidden="true">
                            {count > 99 ? "99+" : count}
                          </b>
                          <span className="sr-only">
                            {" "}
                            ({item.count === "lowStock" ? text.runningLow(count) : text.waiting(count)})
                          </span>
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
