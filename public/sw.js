/*
 * Agarwal General Stores: just enough service worker for the installed app.
 * Pages always come from the network, because prices, stock, the basket and sign-in must be live;
 * nothing the shop shows is ever cached here. Only when there is no connection at all does a
 * page give way to the small offline notice saved at install.
 * It also shows push notifications (src/lib/push), and opens the right page when one is tapped.
 */
const CACHE = "ags-offline-v1";
const OFFLINE = "/offline.html";
// sign-in and its callbacks never pass through here at all
const UNTOUCHED = /^\/(api|auth|login|signup|staff\/login)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      // no navigation preload: it would send a second request for pages left to the browser,
      // such as a sign-in callback whose one-time code must only be used once
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // only opening a page; forms, data requests, photos and scripts go straight to the network
  if (request.mode !== "navigate" || request.method !== "GET") return;
  if (UNTOUCHED.test(new URL(request.url).pathname)) return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(OFFLINE)) ?? Response.error();
      }
    })(),
  );
});

// a notification from the shop: the same title and words as in the bell
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // not ours, or unreadable: still say something, as browsers require
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Agarwal General Stores", {
      body: message.body || "You have a new update.",
      icon: "/icons/icon-192.png",
      // the small monochrome mark in an Android status bar
      badge: "/icons/badge-96.png",
      // the same notice sent twice replaces itself instead of stacking
      tag: message.tag,
      data: { href: message.href || "/account/notifications" },
    }),
  );
});

// tapped: bring the shop forward on that page, or open it
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/account/notifications", self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.href || "/account/notifications", self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    // keep the notifications page
  }
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = open.find((client) => new URL(client.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        if ("navigate" in tab) {
          const moved = await tab.navigate(target.href).catch(() => null);
          if (moved) return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
