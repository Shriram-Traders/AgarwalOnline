"use client";
import { useEffect } from "react";
import { useRefreshStaffCounts } from "./staff-counts";

/** Asks for the menu numbers now: a step that just changed them shouldn't wait for the next minute. */
export function RefreshStaffCounts() {
  const refresh = useRefreshStaffCounts();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return null;
}
