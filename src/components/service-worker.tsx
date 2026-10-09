"use client";
import { useEffect } from "react";
import { pushDeviceIsMineAction, turnOffPushAction } from "@/lib/push/actions";
import { PUSH_OWNER_KEY } from "./push-settings";

/**
 * Registers public/sw.js, which lets Chrome install the shop as an app, shows push notifications
 * and a small "you're offline" page instead of the browser's own. It never caches the shop's pages.
 * Browsers without service workers, or a page opened over plain http on another device, carry on
 * as an ordinary website.
 *
 * `account` (set while push is on for the site and someone is signed in): if this browser's
 * notifications were turned on for somebody else, they stop here, so a shared phone never shows
 * one person's updates to the next. The new person can turn them on for themselves.
 */
export function ServiceWorker({ account }: { account: string | null }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    (async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      if (!account || !("PushManager" in window)) return;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      let owner: string | null = null;
      try {
        owner = localStorage.getItem(PUSH_OWNER_KEY);
      } catch {
        // no storage: ask the server every time
      }
      if (owner === account) return;
      if (await pushDeviceIsMineAction(subscription.endpoint)) {
        try {
          localStorage.setItem(PUSH_OWNER_KEY, account);
        } catch {
          // fine: the server answered
        }
        return;
      }
      await turnOffPushAction(subscription.endpoint);
      await subscription.unsubscribe();
    })().catch(() => {});
  }, [account]);
  return null;
}
