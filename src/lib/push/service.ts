import type { ClientSession } from "mongoose";
import { after } from "next/server";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { getEnv } from "../env";
import { log } from "../logger";
import { Notification } from "../engagement/models";
import { PushDevice } from "./models";
import { isBrowserKey, isPushEndpoint, sendWebPush, type VapidKeys } from "./web-push";

/*
 * Notifications on a phone or PC. Everything that lands in someone's bell (notify()) is also
 * pushed to the browsers they turned notifications on in, once it is saved. Push is off until the
 * VAPID keys are set; the bell works either way.
 */

/** Browsers per person: a phone, a PC and a couple more is plenty; the oldest go first. */
const MAX_DEVICES = 8;

function vapid(): VapidKeys | null {
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  // push services want a way to reach the sender: the shop's address, or a mailbox
  const subject =
    env.VAPID_SUBJECT ?? (env.APP_ORIGIN.startsWith("https://") ? env.APP_ORIGIN : "mailto:push@agarwal-stores.invalid");
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
}

/** The key browsers subscribe with, or null while push is off. */
export function pushPublicKey() {
  return vapid()?.publicKey ?? null;
}

const subscription = z.object({
  endpoint: z.string().refine(isPushEndpoint, "This browser's notification service isn't supported."),
  keys: z.object({
    p256dh: z.string().refine(isBrowserKey, "This browser sent an unusable key."),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/, "This browser sent an unusable key."),
  }),
});

/** "Chrome on Android" from the browser's user agent; only to tell someone's devices apart. */
export function deviceLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "A browser";
  const system = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return system ? `${browser} on ${system}` : browser;
}

/** Saves this browser for the signed-in person; a browser someone else had turned on becomes theirs. */
export async function savePushDevice(userId: string, input: unknown, userAgent?: string | null) {
  if (!vapid()) throw Error("Notifications aren't set up on this site yet.");
  const data = subscription.parse(input);
  await connectDB();
  await PushDevice.updateOne(
    { endpoint: data.endpoint },
    { $set: { userId, p256dh: data.keys.p256dh, auth: data.keys.auth, label: deviceLabel(userAgent) } },
    { upsert: true },
  );
  const extra = await PushDevice.find({ userId }).sort({ updatedAt: -1 }).skip(MAX_DEVICES).select("_id").lean();
  if (extra.length) await PushDevice.deleteMany({ _id: { $in: extra.map((device) => device._id) } });
}

/** Forgets a browser. Knowing its push address is enough: only that browser has it. */
export async function removePushDevice(endpoint: unknown) {
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return;
  await connectDB();
  await PushDevice.deleteOne({ endpoint });
}

/** Whether this browser's notifications go to this person. */
export async function pushDeviceBelongsTo(userId: string, endpoint: unknown) {
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return false;
  await connectDB();
  return Boolean(await PushDevice.exists({ endpoint, userId }));
}

/** Sends a saved notification to every browser its person turned on. Not found (never saved): nothing. */
export async function pushNotification(notificationId: string) {
  if (!vapid()) return { sent: 0, gone: 0, failed: 0 };
  await connectDB();
  const note = await Notification.findById(notificationId)
    .select("userId type title body href")
    .lean<{ _id: unknown; userId: unknown; type: string; title: string; body: string; href?: string }>();
  if (!note) return { sent: 0, gone: 0, failed: 0 };
  return pushToPerson(
    note.userId,
    { title: note.title, body: note.body, href: note.href ?? "/account/notifications", tag: String(note._id) },
    // order and delivery news is worth waking a phone for; the rest can wait for the next check
    note.type === "order" || note.type === "delivery" ? "high" : "normal",
  );
}

/** "Notifications are on": proof from the card that this browser receives them. Not kept in the bell. */
export async function pushTest(userId: string) {
  await connectDB();
  return pushToPerson(
    userId,
    { title: "Notifications are on", body: "Order and delivery updates from Agarwal General Stores will appear like this.", href: "/account/notifications", tag: "test" },
    "high",
  );
}

async function pushToPerson(
  userId: unknown,
  message: { title: string; body: string; href: string; tag: string },
  urgency: "normal" | "high",
) {
  const keys = vapid();
  const counts = { sent: 0, gone: 0, failed: 0 };
  if (!keys) return counts;
  const devices = await PushDevice.find({ userId })
    .select("endpoint p256dh auth")
    .lean<{ _id: unknown; endpoint: string; p256dh: string; auth: string }[]>();
  await Promise.all(
    devices.map(async (device) => {
      try {
        const result = await sendWebPush(device, message, keys, { ttlSeconds: 24 * 3600, urgency });
        if (result.ok) {
          counts.sent += 1;
          await PushDevice.updateOne({ _id: device._id }, { $set: { lastSentAt: new Date() } });
        } else if (result.gone) {
          counts.gone += 1;
          await PushDevice.deleteOne({ _id: device._id });
        } else {
          counts.failed += 1;
          log("warn", "push.rejected", { status: result.status, host: new URL(device.endpoint).hostname });
        }
      } catch (error) {
        counts.failed += 1;
        log("warn", "push.send-failed", { error, host: new URL(device.endpoint).hostname });
      }
    }),
  );
  return counts;
}

/**
 * Pushes a notification once it is saved: after the response in a request (so a transaction has
 * committed by then), or when the transaction ends outside one. A notification whose transaction
 * was rolled back is never found, so nothing is sent for it.
 */
export function schedulePush(notificationId: string, session?: ClientSession) {
  if (!vapid()) return;
  const send = () =>
    pushNotification(notificationId).catch((error) => log("warn", "push.failed", { error }));
  try {
    after(send);
  } catch {
    // a script or a test: there is no request to wait for
    if (session && !session.hasEnded) session.once("ended", () => void send());
    else void send();
  }
}
