"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBasket } from "./basket";

/**
 * The basket page is drawn on the server, but Add on a suggested item only updates the basket
 * count in the browser. When the two disagree, redraw the page so the new line and the bill
 * show. Once per new count, so a mismatch that a redraw can't settle never loops.
 */
export function BasketSync({ units }: { units: number }) {
  const { count } = useBasket();
  const router = useRouter();
  const refreshedFor = useRef<number | null>(null);
  useEffect(() => {
    if (count === units || refreshedFor.current === count) return;
    refreshedFor.current = count;
    router.refresh();
  }, [count, units, router]);
  return null;
}
