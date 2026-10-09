"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { StaffCountsResponse } from "@/lib/staff/types";

const EMPTY: StaffCountsResponse = { at: "", counts: {}, needsYou: 0 };
const Counts = createContext<StaffCountsResponse>(EMPTY);
const Refresh = createContext<() => Promise<void>>(async () => {});

/** The menu and bell numbers. The root layout never re-renders on navigation, so they're fetched here. */
export function useStaffCounts() {
  return useContext(Counts);
}

/** Asks for the numbers again now, e.g. when the new-order sound hears of an order. */
export function useRefreshStaffCounts() {
  return useContext(Refresh);
}

/**
 * Asks /api/staff/counts when the workspace opens, on page changes (at most every 10 s), when
 * the tab comes back into view and every minute while it's open. A failed ask keeps the last numbers.
 */
export function StaffCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<StaffCountsResponse>(EMPTY);
  const pathname = usePathname();
  const last = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    last.current = Date.now();
    try {
      const response = await fetch("/api/staff/counts", { cache: "no-store", signal: controller.signal });
      if (response.ok) setCounts((await response.json()) as StaffCountsResponse);
    } catch {
      // offline or cancelled: the last numbers stay
    }
  }, []);
  useEffect(() => {
    if (Date.now() - last.current > 10_000) void refresh();
  }, [pathname, refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      inflight.current?.abort();
      // a cancelled ask mustn't count as asked, or a remount would wait for the next tick
      last.current = 0;
    };
  }, [refresh]);
  return (
    <Refresh.Provider value={refresh}>
      <Counts.Provider value={counts}>{children}</Counts.Provider>
    </Refresh.Provider>
  );
}
