import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from "node:crypto";

/*
 * Web Push with nothing but node:crypto: the message is encrypted for the one browser that
 * subscribed (RFC 8291, "aes128gcm"), and the request is signed with the shop's VAPID key
 * (RFC 8292) so the push service knows who is sending. The push service (Google, Mozilla, Apple,
 * Microsoft) only ever sees ciphertext.
 */

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

const b64 = (bytes: Buffer) => bytes.toString("base64url");
const unb64 = (text: string) => Buffer.from(text, "base64url");
/** Every record is one record here: a notification is far below the 4 KB a push service takes. */
const RECORD_SIZE = 4096;

/** A fresh VAPID key pair, in the form the env vars take. */
export function newVapidKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), unb64(jwk.x!), unb64(jwk.y!)]);
  return { publicKey: b64(publicKey), privateKey: jwk.d! };
}

/** True for a browser's key: an uncompressed P-256 point the shop can agree a secret with. */
export function isBrowserKey(p256dh: string) {
  const key = unb64(p256dh);
  if (key.length !== 65 || key[0] !== 4) return false;
  try {
    // a point that isn't on the curve throws here
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    ecdh.computeSecret(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts a message for one browser (RFC 8291). `salt` and `senderPrivate` are only passed by
 * tests, to check against the RFC's worked example; real sends always use fresh random ones.
 */
export function encryptPayload(
  plaintext: Buffer,
  browserKey: Buffer,
  authSecret: Buffer,
  fixed: { salt?: Buffer; senderPrivate?: Buffer } = {},
) {
  const ecdh = createECDH("prime256v1");
  if (fixed.senderPrivate) ecdh.setPrivateKey(fixed.senderPrivate);
  else ecdh.generateKeys();
  const senderPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(browserKey);
  const salt = fixed.salt ?? randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), browserKey, senderPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", key, nonce);
  // 0x02 marks the last (and only) record
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, sealed]);
}

/** The Authorization header: a short-lived token signed with the shop's private key (RFC 8292). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)) {
  const json = (value: object) => b64(Buffer.from(JSON.stringify(value)));
  const unsigned = `${json({ typ: "JWT", alg: "ES256" })}.${json({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 3600,
    sub: keys.subject,
  })}`;
  const point = unb64(keys.publicKey);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64(point.subarray(1, 33)), y: b64(point.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64(signature)}, k=${keys.publicKey}`;
}

/** The push services browsers use. Sends go only here, never to an address someone made up. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet, Opera
  /^android\.googleapis\.com$/,
  /\.push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge on Windows
  /(^|\.)push\.apple\.com$/, // Safari, and iPhone home-screen apps
];
export function isPushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Sends one encrypted message. `gone` means the browser unsubscribed (or the subscription
 * expired), so the device should be forgotten.
 */
export async function sendWebPush(
  target: PushTarget,
  message: object,
  keys: VapidKeys,
  options: { ttlSeconds: number; urgency: "normal" | "high" },
) {
  if (!isPushEndpoint(target.endpoint)) return { ok: false, gone: true, status: 0 };
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), unb64(target.p256dh), unb64(target.auth));
  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(target.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds),
      Urgency: options.urgency,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: response.ok, gone: response.status === 404 || response.status === 410, status: response.status };
}
