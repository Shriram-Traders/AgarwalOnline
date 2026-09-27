"use client";
import Link from "next/link";
import { createContext, use, useOptimistic, useState } from "react";
import { ShoppingBag } from "lucide-react";

export type BasketLines = Record<string, { quantity: number; pricePaise: number }>;
export type BasketChange = { variantId: string; quantity: number; pricePaise: number };

function apply(lines: BasketLines, { variantId, quantity, pricePaise }: BasketChange) {
  const next = { ...lines };
  if (quantity > 0) next[variantId] = { quantity, pricePaise };
  else delete next[variantId];
  return next;
}

const BasketContext = createContext<{
  lines: BasketLines;
  preview: (change: BasketChange) => void;
  commit: (change: BasketChange) => void;
}>({ lines: {}, preview() {}, commit() {} });

/** The basket as the client sees it, so a tap updates every card and count without re-rendering the page. */
export function BasketProvider({
  lines: server,
  children,
}: {
  lines: BasketLines;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState(server);
  const [seen, setSeen] = useState(server);
  // A server re-render (product page, basket page, sign-in) carries the stored basket: it wins.
  // ponytail: a refresh rendered before an in-flight card save lands shows the older count until
  // the next tap; skip server snapshots while a save is pending if that ever shows up outside dev HMR.
  if (server !== seen) {
    setSeen(server);
    setSaved(server);
  }
  const [lines, preview] = useOptimistic(saved, apply);
  const commit = (change: BasketChange) => setSaved((prev) => apply(prev, change));
  return <BasketContext value={{ lines, preview, commit }}>{children}</BasketContext>;
}

export function useBasket() {
  const basket = use(BasketContext);
  const all = Object.values(basket.lines);
  return {
    ...basket,
    count: all.reduce((sum, line) => sum + line.quantity, 0),
    totalPaise: all.reduce((sum, line) => sum + line.quantity * line.pricePaise, 0),
  };
}

export function BasketLink({ label }: { label: string }) {
  const { count } = useBasket();
  return (
    <Link href="/cart" className="cart-button" aria-label={count > 0 ? `${label}, ${count}` : label}>
      <ShoppingBag size={20} aria-hidden="true" />
      <span>{label}</span>
      {count > 0 && <b aria-hidden="true">{count}</b>}
    </Link>
  );
}
