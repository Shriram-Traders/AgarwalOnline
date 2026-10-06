"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { skipFeedbackAction } from "@/lib/feedback/actions";
import { feedbackPromptAllowed } from "@/lib/feedback/rules";
import type { Locale } from "@/lib/locale-types";
import type { FeedbackOrder } from "./feedback-sheet";
import { safeAction } from "./safe-action";

// most visits have nothing to rate: the sheet is only downloaded when it's about to open
const FeedbackSheet = dynamic(() => import("./feedback-sheet").then((module) => module.FeedbackSheet));
const skip = safeAction(skipFeedbackAction);

/** Orders already answered or closed in this tab, in case saving the "Not now" didn't get through. */
const CLOSED_KEY = "ags-feedback-closed";
function closedHere(orderId: string) {
  try {
    return window.sessionStorage.getItem(CLOSED_KEY) === orderId;
  } catch {
    return false;
  }
}
function rememberClosed(orderId: string) {
  try {
    window.sessionStorage.setItem(CLOSED_KEY, orderId);
  } catch {
    // private windows can refuse storage; the server remembers anyway
  }
}

/**
 * Asks "How did we do?" about the shopper's newest delivered order, once. It opens a moment
 * after a page they're browsing settles, never over another popup, and never in the middle of
 * something: adding to the basket re-renders the header, and that must not bring it up.
 * Closing it any way but Send counts as "Not now" and is remembered; the order's own page still
 * has the stars.
 */
export function FeedbackPrompt({ order, locale }: { order: FeedbackOrder | null; locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<{ at: string; order: FeedbackOrder } | null>(null);
  const latest = useRef(order);
  useEffect(() => {
    latest.current = order;
  }, [order]);

  useEffect(() => {
    if (!feedbackPromptAllowed(pathname)) return;
    const timer = window.setTimeout(() => {
      const pending = latest.current;
      if (!pending || closedHere(pending.orderId)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      setOpen({ at: pathname, order: pending });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const close = useCallback(
    (sent: boolean) => {
      const asked = open?.order;
      setOpen(null);
      if (!asked) return;
      rememberClosed(asked.orderId);
      if (sent) return router.refresh();
      const form = new FormData();
      form.set("orderId", asked.orderId);
      void skip({}, form);
    },
    [open, router],
  );

  // it belongs to the page it opened on: moving on closes it without an answer
  if (!open || open.at !== pathname) return null;
  return <FeedbackSheet order={open.order} locale={locale} onClose={close} />;
}
