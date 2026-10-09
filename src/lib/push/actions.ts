"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { currentUser } from "../auth/session";
import { rateLimit } from "../auth/rate-limit";
import { log } from "../logger";
import { pushDeviceBelongsTo, pushTest, removePushDevice, savePushDevice } from "./service";

/** What the notifications card hears back: done, or a plain reason. */
export type PushResult = { ok: true } | { ok: false; error: string };

/** Turns notifications on for this browser, for the signed-in person. */
export async function turnOnPushAction(subscription: unknown): Promise<PushResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again to turn on notifications." };
  try {
    await rateLimit(`push-device:${user.id}`, 20, 60 * 60 * 1000);
    await savePushDevice(user.id, subscription, (await headers()).get("user-agent"));
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "This browser can't receive notifications." };
    const message = error instanceof Error ? error.message : "";
    if (/^Notifications aren/.test(message)) return { ok: false, error: message };
    if (/too many/i.test(message)) return { ok: false, error: "Too many tries. Please wait a little and try again." };
    log("error", "push.subscribe-failed", { error });
    return { ok: false, error: "Couldn’t turn on notifications. Please try again." };
  }
}

/** Turns them off for this browser. The browser's own push address is what identifies it. */
export async function turnOffPushAction(endpoint: unknown): Promise<PushResult> {
  await removePushDevice(endpoint);
  return { ok: true };
}

/** A test notification to every browser the signed-in person turned on. */
export async function sendTestPushAction(): Promise<PushResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  try {
    await rateLimit(`push-test:${user.id}`, 5, 10 * 60 * 1000);
  } catch {
    return { ok: false, error: "Too many tests. Please wait a few minutes." };
  }
  const result = await pushTest(user.id);
  return result.sent
    ? { ok: true }
    : { ok: false, error: "The test didn’t go through. Turn notifications off and on again, then try once more." };
}

/** Whether this browser's notifications still go to whoever is signed in now. */
export async function pushDeviceIsMineAction(endpoint: unknown): Promise<boolean> {
  const user = await currentUser();
  return user ? pushDeviceBelongsTo(user.id, endpoint) : false;
}
