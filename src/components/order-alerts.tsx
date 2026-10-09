"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BellOff, BellRing, X } from "lucide-react";
import type { Locale } from "@/lib/locale-types";
import type { NewOrdersResponse } from "@/app/api/staff/new-orders/route";
import { formatPrice } from "@/lib/display";
import { useRefreshStaffCounts } from "./staff-counts";

const KEY = "ags-order-alerts";
const EVERY_MS = 20_000;
const LIST = "/admin?status=to-confirm#orders";

const WORDS = {
  en: {
    label: "New-order sound",
    turnOn: "Turn on the new-order sound",
    turnOff: "Turn off the new-order sound",
    on: "New-order sound is on. You’ll hear a chime when an order comes in.",
    off: "New-order sound is off.",
    blocked: "This browser blocks pop-up notifications, so you’ll hear the chime and see a note here.",
    one: (number: string, total: string, area?: string) => `New order ${number} · ${total}${area ? ` · ${area}` : ""}`,
    many: (count: number) => `${count} new orders to confirm`,
    tab: "● New order",
    open: "Open the order",
    openList: "See orders to confirm",
    dismiss: "Dismiss",
  },
  mr: {
    label: "नवीन ऑर्डरचा आवाज",
    turnOn: "नवीन ऑर्डरचा आवाज चालू करा",
    turnOff: "नवीन ऑर्डरचा आवाज बंद करा",
    on: "नवीन ऑर्डरचा आवाज चालू आहे. ऑर्डर आल्यावर घंटी वाजेल.",
    off: "नवीन ऑर्डरचा आवाज बंद आहे.",
    blocked: "हा ब्राउझर सूचना दाखवत नाही, त्यामुळे घंटी वाजेल आणि इथे सूचना दिसेल.",
    one: (number: string, total: string, area?: string) => `नवीन ऑर्डर ${number} · ${total}${area ? ` · ${area}` : ""}`,
    many: (count: number) => `पुष्टी करायच्या ${count} नवीन ऑर्डर`,
    tab: "● नवीन ऑर्डर",
    open: "ऑर्डर उघडा",
    openList: "पुष्टी करायच्या ऑर्डर पहा",
    dismiss: "बंद करा",
  },
} as const;

// whether the sound is on lives in this browser, shared by every staff tab
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function isOn() {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}
function setOn(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "on");
    else window.localStorage.removeItem(KEY);
  } catch {
    // private window: the switch lasts until the page closes
  }
  listeners.forEach((listener) => listener());
}

/** A short two-note chime, made in the browser so there's no sound file to load. */
function chime(audio: AudioContext | null) {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime + 0.02;
  [880, 1320].forEach((frequency, index) => {
    const at = start + index * 0.18;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    tone.connect(volume).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.4);
  });
}

type Toast = { orders: NewOrdersResponse["orders"] };

/**
 * The bell-with-a-sound button in the staff header. Switched on, it asks every 20 seconds for
 * orders waiting to be confirmed; a new one plays a chime, shows a note on the page, flashes the
 * tab's title and, when the tab is in the background, a browser notification. Staff who manage
 * orders only; the choice is remembered in this browser.
 */
export function OrderAlerts({ locale }: { locale: Locale }) {
  const words = WORDS[locale];
  const on = useSyncExternalStore(subscribe, isOn, () => false);
  const refreshCounts = useRefreshStaffCounts();
  const [toast, setToast] = useState<Toast | null>(null);
  const [note, setNote] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const since = useRef<string | null>(null);
  const seen = useRef(new Set<string>());

  // browsers only let a page make sound after a tap, so the context is made or woken on one
  const wake = useCallback(() => {
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      audio.current ??= new Context();
      if (audio.current.state === "suspended") void audio.current.resume();
    } catch {
      // no sound in this browser: the note and the notification still work
    }
  }, []);

  const toggle = () => {
    if (on) {
      setOn(false);
      setNote(words.off);
      return;
    }
    wake();
    setOn(true);
    setNote(words.on);
    window.setTimeout(() => chime(audio.current), 60);
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().then((answer) => {
        if (answer === "denied") setNote(`${words.on} ${words.blocked}`);
      });
    } else if ("Notification" in window && Notification.permission === "denied") setNote(`${words.on} ${words.blocked}`);
  };

  // after a reload the sound is still on, but needs the next tap anywhere before it can play
  useEffect(() => {
    if (!on) return;
    const onTap = () => wake();
    document.addEventListener("pointerdown", onTap, { once: true });
    document.addEventListener("keydown", onTap, { once: true });
    return () => {
      document.removeEventListener("pointerdown", onTap);
      document.removeEventListener("keydown", onTap);
    };
  }, [on, wake]);

  useEffect(() => {
    if (!on) {
      since.current = null;
      seen.current.clear();
      return;
    }
    let stopped = false;
    let controller: AbortController | null = null;
    const ask = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const query = since.current ? `?since=${encodeURIComponent(since.current)}` : "";
        const response = await fetch(`/api/staff/new-orders${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as NewOrdersResponse;
        const first = since.current === null;
        since.current = body.at;
        const fresh = body.orders.filter((order) => !seen.current.has(order.id));
        fresh.forEach((order) => seen.current.add(order.id));
        // the first ask only learns what's already waiting
        if (first || fresh.length === 0) return;
        chime(audio.current);
        setToast((current) => ({ orders: [...fresh, ...(current?.orders ?? [])].slice(0, 20) }));
        void refreshCounts();
        if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
          const only = fresh.length === 1 ? fresh[0] : null;
          const notice = new Notification(
            only ? words.one(only.number, formatPrice(only.totalPaise), only.area) : words.many(fresh.length),
            { tag: "ags-new-order" },
          );
          notice.onclick = () => {
            window.focus();
            window.location.assign(only ? `/admin/orders/${only.id}` : LIST);
            notice.close();
          };
        }
      } catch {
        // offline or cancelled: try again on the next tick
      }
    };
    void ask();
    const timer = window.setInterval(() => void ask(), EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [on, refreshCounts, words]);

  // while a new order waits and the tab is in the background, its title blinks
  useEffect(() => {
    if (!toast) return;
    // the page's own title, kept only while it's swapped out, so a page opened since keeps its own
    let saved: string | null = null;
    let blink = false;
    const restore = () => {
      if (saved !== null) document.title = saved;
      saved = null;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") return restore();
      saved ??= document.title;
      blink = !blink;
      document.title = blink ? words.tab : saved;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      restore();
    };
  }, [toast, words]);

  const latest = toast?.orders[0];
  return (
    <>
      <button
        type="button"
        className={`order-alerts${on ? " is-on" : ""}`}
        aria-pressed={on}
        title={on ? words.turnOff : words.turnOn}
        onClick={toggle}
      >
        {on ? <BellRing size={20} aria-hidden="true" /> : <BellOff size={20} aria-hidden="true" />}
        <span className="sr-only">{words.label}</span>
      </button>
      {/* read out politely, without claiming the page's role="status" (each page has its own) */}
      <span className="sr-only" aria-live="polite">
        {note}
      </span>
      {/* on the page itself: inside the header, whose blur makes it the box "fixed" is measured
          from, the note would sit under the header instead of at the bottom of the screen */}
      {toast &&
        latest &&
        createPortal(
          <div className="order-toast" role="alert">
            <BellRing size={20} aria-hidden="true" />
            <p>
              <strong>
                {toast.orders.length === 1
                  ? words.one(latest.number, formatPrice(latest.totalPaise), latest.area)
                  : words.many(toast.orders.length)}
              </strong>
              <Link
                href={toast.orders.length === 1 ? `/admin/orders/${latest.id}` : LIST}
                onClick={() => setToast(null)}
              >
                {toast.orders.length === 1 ? words.open : words.openList}
              </Link>
            </p>
            <button type="button" className="icon-button" onClick={() => setToast(null)} aria-label={words.dismiss} title={words.dismiss}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
