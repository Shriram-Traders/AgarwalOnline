"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* The playful look's moving parts; styles in src/app/playful.css. */

const COLORS = ["#fbbf24", "#1e3a8a", "#93c5fd", "#fb7185"];
const ADD = ".add-button, .product-add, .qty-stepper button[aria-label='Increase quantity']";
const HEART = ".wishlist-control button";
const BASKET = ".cart-bar, .cart-button, .mobile-nav a[href='/cart'] .nav-icon";

function bumpBasket() {
  for (const el of document.querySelectorAll(BASKET)) {
    el.classList.remove("fx-bump");
    void (el as HTMLElement).offsetWidth; // restart the animation
    el.classList.add("fx-bump");
  }
}

/** A copy of the product photo arcs from the card into whichever basket is on screen; the basket bumps as it lands. */
function flyToBasket(button: Element) {
  const photo = (button.closest(".product-card") ?? document.querySelector(".product-gallery"))?.querySelector("img");
  const goal = [...document.querySelectorAll(BASKET)].find((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < innerHeight;
  });
  if (!photo || !goal) return bumpBasket();
  const from = photo.getBoundingClientRect();
  const to = goal.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 120);
  const ghost = document.createElement("div");
  ghost.className = "fx-ghost";
  Object.assign(ghost.style, {
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  const copy = document.createElement("img");
  copy.src = photo.currentSrc || photo.src;
  copy.alt = "";
  ghost.append(copy);
  document.body.append(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const timing = { duration: 720, fill: "forwards" as const };
  const up = dy < 0; // the header basket on a computer; phones keep it below
  ghost.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], {
    ...timing,
    easing: up ? "cubic-bezier(0.55, 0, 0.8, 0.6)" : "cubic-bezier(0.3, 0.1, 0.5, 1)",
  });
  // rising: up first, then across. Dropping: a negative control point lifts it before it falls in
  copy
    .animate(
      [
        { transform: "translateY(0) scale(1)", opacity: 1 },
        { transform: `translateY(${dy}px) scale(0.18)`, opacity: 0.5 },
      ],
      { ...timing, easing: up ? "cubic-bezier(0.15, 0.7, 0.35, 1)" : "cubic-bezier(0.5, -0.6, 0.9, 0.6)" },
    )
    .finished.catch(() => {})
    .finally(() => {
      ghost.remove();
      bumpBasket();
    });
}

function burst(x: number, y: number, hearts: boolean, count = hearts ? 5 : 10, reach = 22) {
  const box = document.createElement("div");
  box.className = hearts ? "fx-burst hearts" : "fx-burst";
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("i");
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = reach + Math.random() * reach;
    bit.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    bit.style.setProperty("--dy", `${Math.sin(angle) * distance - (hearts ? 14 : 6)}px`);
    bit.style.setProperty("--c", COLORS[i % COLORS.length]);
    if (hearts) bit.textContent = "♥";
    box.append(bit);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 650);
}

const moving = () =>
  document.documentElement.dataset.look === "playful" && !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A small sparkle and a photo flying into the basket on ADD, hearts on save, a light and a tilt that follow the mouse. */
export function PlayfulFx() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  // checkout lands on the new order's page: the one moment worth real confetti
  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from !== "/checkout" || !pathname.startsWith("/account/orders/") || !moving()) return;
    const icon = document.querySelector(".order-hero-icon")?.getBoundingClientRect();
    if (icon) setTimeout(() => burst(icon.left + icon.width / 2, icon.top + icon.height / 2, false, 28, 70), 250);
  }, [pathname]);

  // the basket just reached free delivery (said by the basket bar): a burst from the bar
  useEffect(() => {
    const onFree = () => {
      const bar = moving() ? document.querySelector(".cart-bar")?.getBoundingClientRect() : undefined;
      if (bar?.width) burst(bar.left + bar.width / 2, bar.top + 8, false, 24, 64);
    };
    document.addEventListener("basket:free", onFree);
    return () => document.removeEventListener("basket:free", onFree);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // capture: runs before React swaps the ADD button for the stepper
    const onClick = (event: MouseEvent) => {
      if (!moving()) return;
      const target = (event.target as Element).closest?.(`${ADD}, ${HEART}`);
      if (!(target instanceof HTMLButtonElement) || target.disabled) return;
      const hearts = target.matches(HEART);
      if (hearts && target.classList.contains("saved")) return; // un-saving gets no party
      const rect = target.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, hearts);
      if (!hearts) flyToBasket(target);
    };
    // the hero's light and the deal card's tilt follow a mouse (touch has no hover to follow)
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || root.dataset.look !== "playful") return;
      const card = (event.target as Element).closest?.(".hero-card, .deal-card");
      if (!(card instanceof HTMLElement)) return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.style.setProperty("--mx", `${x * 100}%`);
      card.style.setProperty("--my", `${y * 100}%`);
      card.style.setProperty("--rx", `${(0.5 - y) * 5}deg`);
      card.style.setProperty("--ry", `${(x - 0.5) * 5}deg`);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);

  return null;
}
