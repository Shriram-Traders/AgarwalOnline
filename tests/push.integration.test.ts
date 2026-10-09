import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { Notification } from "../src/lib/engagement/models";
import { notify, notifyNewOrder } from "../src/lib/engagement/service";
import { PushDevice } from "../src/lib/push/models";
import { newVapidKeys } from "../src/lib/push/web-push";
import {
  deviceLabel,
  pushDeviceBelongsTo,
  pushNotification,
  pushPublicKey,
  removePushDevice,
  savePushDevice,
} from "../src/lib/push/service";

const uri = process.env.TEST_MONGODB_URI;

/** A browser: its keys, and the subscription it would hand the shop. */
function browser(endpoint = `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from(Math.random().toString(36).slice(2, 18).padEnd(16, "x"));
  return {
    ecdh,
    auth,
    subscription: {
      endpoint,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    },
  };
}

/** What the browser reads out of a push (RFC 8291). */
function open(body: Buffer, device: ReturnType<typeof browser>) {
  const salt = body.subarray(0, 16);
  const sender = body.subarray(21, 21 + body[20]);
  const sealed = body.subarray(21 + body[20]);
  const shared = device.ecdh.computeSecret(sender);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), device.ecdh.getPublicKey(), sender]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, device.auth, info, 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}

describe.skipIf(!uri)("Push notifications", () => {
  let customer: string, other: string, owner: string, admin: string, rider: string;
  const keys = newVapidKeys();

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:owner@example.com",
    });
    await connectDB();
    for (const model of [User, Notification, PushDevice]) await model.init();
  });
  beforeEach(async () => {
    for (const model of [User, Notification, PushDevice]) await model.deleteMany({});
    const user = async (name: string, phone: string, roles: string[], active = true) =>
      String((await User.create({ name, phone, roles, active }))._id);
    customer = await user("Kalpana Shinde", "9000000201", ["customer"]);
    other = await user("Someone else", "9000000202", ["customer"]);
    owner = await user("Owner", "9000000203", ["customer", "super-admin"]);
    admin = await user("Counter staff", "9000000204", ["customer", "admin"]);
    rider = await user("Rider", "9000000205", ["customer", "delivery"]);
    await user("Former staff", "9000000206", ["customer", "admin"], false);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) delete process.env[key];
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("saves a browser for its person, refuses anything that isn't a real push subscription", async () => {
    expect(pushPublicKey()).toBe(keys.publicKey);
    const phone = browser();
    await savePushDevice(customer, phone.subscription, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36");
    const saved = await PushDevice.findOne({ endpoint: phone.subscription.endpoint });
    expect(saved).toMatchObject({ p256dh: phone.subscription.keys.p256dh, auth: phone.subscription.keys.auth, label: "Chrome on Android" });
    expect(await pushDeviceBelongsTo(customer, phone.subscription.endpoint)).toBe(true);
    expect(await pushDeviceBelongsTo(other, phone.subscription.endpoint)).toBe(false);

    await expect(savePushDevice(customer, { ...phone.subscription, endpoint: "https://127.0.0.1/steal" })).rejects.toThrow("isn't supported");
    await expect(savePushDevice(customer, { ...phone.subscription, endpoint: "http://fcm.googleapis.com/x" })).rejects.toThrow();
    await expect(
      savePushDevice(customer, { ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: "A".repeat(87) } }),
    ).rejects.toThrow("unusable key");
    await expect(savePushDevice(customer, { ...phone.subscription, keys: { ...phone.subscription.keys, auth: "x" } })).rejects.toThrow();

    // the same browser turned on by the next person on it becomes theirs
    await savePushDevice(other, phone.subscription, "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0");
    expect(await PushDevice.countDocuments()).toBe(1);
    expect(await pushDeviceBelongsTo(other, phone.subscription.endpoint)).toBe(true);
    expect(await pushDeviceBelongsTo(customer, phone.subscription.endpoint)).toBe(false);

    // eight browsers at most; the oldest goes
    for (let i = 0; i < 9; i += 1) await savePushDevice(customer, browser().subscription);
    expect(await PushDevice.countDocuments({ userId: customer })).toBe(8);

    await removePushDevice(phone.subscription.endpoint);
    expect(await PushDevice.countDocuments({ userId: other })).toBe(0);
    await removePushDevice({ $ne: null });
    expect(await PushDevice.countDocuments({ userId: customer })).toBe(8);
  });

  it("pushes a saved notification, encrypted for each browser, and forgets browsers that left", async () => {
    const phone = browser();
    const laptop = browser("https://updates.push.services.mozilla.com/wpush/v2/laptop");
    await savePushDevice(customer, phone.subscription);
    await savePushDevice(customer, laptop.subscription);
    await savePushDevice(other, browser().subscription);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      new Response(null, { status: String(url).includes("mozilla") ? 410 : 201 }),
    );
    const [note] = await Notification.create([
      { userId: customer, type: "delivery", title: "Out for delivery", body: "AGS-20261010-00042 is on its way.", href: "/account/orders/1" },
    ]);
    expect(await pushNotification(String(note._id))).toEqual({ sent: 1, gone: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const call = fetch.mock.calls.find(([url]) => url === phone.subscription.endpoint)!;
    const init = call[1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers).toMatchObject({ "Content-Encoding": "aes128gcm", TTL: "86400", Urgency: "high" });
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(open(init.body as Buffer, phone)).toEqual({
      title: "Out for delivery",
      body: "AGS-20261010-00042 is on its way.",
      href: "/account/orders/1",
      tag: String(note._id),
    });
    // Firefox said the subscription is gone: that browser is forgotten
    expect(await PushDevice.exists({ endpoint: laptop.subscription.endpoint })).toBeNull();
    expect((await PushDevice.findOne({ endpoint: phone.subscription.endpoint }))?.lastSentAt).toBeInstanceOf(Date);
    // a notification that was never saved sends nothing
    expect(await pushNotification(String(new mongoose.Types.ObjectId()))).toEqual({ sent: 0, gone: 0, failed: 0 });
  });

  it("sends from notify() only once the notification is saved, never for a rolled-back one", async () => {
    await savePushDevice(customer, browser().subscription);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));

    await notify({ userId: customer, type: "order", title: "Order placed", body: "AGS-1 is confirmed.", href: "/account/orders/1" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await mongoose.connection
      .transaction(async (session) => {
        await notify({ userId: customer, type: "order", title: "Never happened", body: "Rolled back." }, session);
        throw Error("roll back");
      })
      .catch(() => {});
    await mongoose.connection.transaction(async (session) => {
      await notify({ userId: customer, type: "order", title: "Packed", body: "AGS-1 is packed." }, session);
      // not before the transaction has committed
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await Notification.countDocuments({ title: "Never happened" })).toBe(0);
  });

  it("tells everyone who manages orders about a new order, and no one else", async () => {
    await notifyNewOrder({
      _id: "66f0c0ffee66f0c0ffee66f0",
      number: "AGS-20261010-00043",
      totalPaise: 124000,
      paymentMethod: "cod",
      items: [{ quantity: 2 }, { quantity: 1 }],
      address: { name: "Kalpana Shinde", areaName: "Nagothane" },
    });
    const notes = await Notification.find({ title: "New order AGS-20261010-00043" }).lean<{ userId: unknown; body: string; href: string }[]>();
    expect(notes.map((note) => String(note.userId)).sort()).toEqual([owner, admin].sort());
    expect(notes[0]).toMatchObject({
      body: "₹1,240 · 3 items · Kalpana S. · Nagothane · cash on delivery",
      href: "/admin/orders/66f0c0ffee66f0c0ffee66f0",
    });
    expect(await Notification.countDocuments({ userId: { $in: [customer, rider] } })).toBe(0);
  });

  it("names a device the way people know it", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36")).toBe("Samsung Internet on Android");
    expect(deviceLabel(null)).toBe("A browser");
  });
});
