import { describe, expect, it } from "vitest";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from "node:crypto";
import { encryptPayload, isBrowserKey, isPushEndpoint, newVapidKeys, vapidAuthorization } from "../src/lib/push/web-push";

const unb64 = (text: string) => Buffer.from(text, "base64url");

/** What the browser does with a message: the other half of RFC 8291. */
function decrypt(body: Buffer, browserPrivate: Buffer, authSecret: Buffer) {
  const salt = body.subarray(0, 16);
  const idLength = body[20];
  const senderPublic = body.subarray(21, 21 + idLength);
  const sealed = body.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(browserPrivate);
  const browserPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), browserPublic, senderPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  expect(padded[padded.length - 1]).toBe(2);
  return { record: body.readUInt32BE(16), text: padded.subarray(0, padded.length - 1).toString() };
}

describe("Web Push", () => {
  it("encrypts exactly as the worked example in RFC 8291 (appendix A)", () => {
    const body = encryptPayload(
      Buffer.from("When I grow up, I want to be a watermelon"),
      unb64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      unb64("BTBZMqHH6r4Tts7J_aSIgg"),
      { salt: unb64("DGv6ra1nlYgDCS1FRnbzlw"), senderPrivate: unb64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") },
    );
    expect(body.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("gives a browser a message only it can read, different every time", () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const auth = Buffer.from("0123456789abcdef");
    const message = JSON.stringify({ title: "Out for delivery", body: "AGS-20261010-0042 is on its way.", href: "/account/orders/1" });
    const first = encryptPayload(Buffer.from(message), browser.getPublicKey(), auth);
    const second = encryptPayload(Buffer.from(message), browser.getPublicKey(), auth);
    expect(first.equals(second)).toBe(false);
    expect(decrypt(first, browser.getPrivateKey(), auth)).toEqual({ record: 4096, text: message });
    expect(decrypt(second, browser.getPrivateKey(), auth).text).toBe(message);
    // the wrong auth secret can't open it
    expect(() => decrypt(first, browser.getPrivateKey(), Buffer.from("fedcba9876543210"))).toThrow();
  });

  it("signs a VAPID token that the shop's public key verifies", () => {
    const keys = { ...newVapidKeys(), subject: "mailto:owner@example.com" };
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, 1_800_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, signature] = token.split(".");
    expect(JSON.parse(unb64(head).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(unb64(claims).toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_800_000_000 + 12 * 3600,
      sub: "mailto:owner@example.com",
    });
    const point = unb64(keys.publicKey);
    const publicKey = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") },
      format: "jwk",
    });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, unb64(signature))).toBe(true);
  });

  it("only ever sends to the browsers' push services", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/QGuQyavXutnMH",
    ])
      expect(isPushEndpoint(ok), ok).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://user@fcm.googleapis.com/x",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://evilpush.apple.com.example/x",
      "not a url",
      42,
      `https://fcm.googleapis.com/${"a".repeat(1000)}`,
    ])
      expect(isPushEndpoint(bad), String(bad)).toBe(false);
  });

  it("accepts only a real browser key", () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    expect(isBrowserKey(browser.getPublicKey().toString("base64url"))).toBe(true);
    const offCurve = Buffer.alloc(65, 1);
    offCurve[0] = 4;
    expect(isBrowserKey(offCurve.toString("base64url"))).toBe(false);
    expect(isBrowserKey("short")).toBe(false);
  });
});
