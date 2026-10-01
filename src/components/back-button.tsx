"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HOME_PATHS, parentPath } from "@/lib/back-path";

/** Pages of the shop seen in this tab, oldest first, for browsers without the Navigation API. */
const trail: string[] = [];
function remember(pathname: string) {
  if (trail[trail.length - 1] === pathname) return;
  if (trail[trail.length - 2] === pathname) trail.pop();
  else trail.push(pathname);
}

/** True when the previous entry in this tab is a page of the shop, so going back stays on the site. */
function canGoBack() {
  const navigation = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
  if (typeof navigation?.canGoBack === "boolean") return navigation.canGoBack;
  return trail.length > 1;
}

/**
 * Back, on every page but the starting ones. It returns to the previous page like the phone's
 * own back button, and when the page was opened straight from a link it goes one level up
 * instead of leaving the shop. An installed app has no browser back button to fall back on.
 */
export function BackButton({ label, className }: { label: string; className: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    remember(pathname);
  }, [pathname]);
  if (HOME_PATHS.has(pathname)) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => (canGoBack() ? router.back() : router.push(parentPath(pathname)))}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span className="back-label">{label}</span>
    </button>
  );
}
