"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/display";
import { copy, type Locale } from "@/lib/locale-types";
import { useBasket } from "./basket";

/** Sticky basket summary on phones (quick-commerce pattern); hidden where it would be redundant. */
export function CartBar({ locale }: { locale: Locale }) {
  const { count, totalPaise } = useBasket();
  const pathname = usePathname();
  const quiet = ["/cart", "/checkout", "/staff", "/admin", "/super-admin", "/delivery"];
  if (count === 0 || quiet.some((p) => pathname.startsWith(p))) return null;
  const text = copy[locale];
  return (
    <Link href="/cart" className="cart-bar" aria-label={`${text.items(count)}, ${formatPrice(totalPaise)}. ${text.viewBasket}`}>
      <span>
        <b>{text.items(count)}</b>
        <small>{formatPrice(totalPaise)}</small>
      </span>
      <span>
        {text.viewBasket} <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}
