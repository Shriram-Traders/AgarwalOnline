"use client";
import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { sendTestPushAction, pushDeviceIsMineAction, turnOffPushAction, turnOnPushAction } from "@/lib/push/actions";

type State = "checking" | "unsupported" | "iphone" | "blocked" | "off" | "on";

/** Marks which account this browser's notifications were turned on for (see ServiceWorker). */
export const PUSH_OWNER_KEY = "ags-push-owner";

const words = {
  en: {
    title: "Notifications on this device",
    off: "Get order, delivery and payment updates on this phone or computer, even when the shop isn’t open.",
    offStaff: "Get new orders and updates on this phone or computer, even when the workspace isn’t open.",
    on: "On for this device. Updates arrive even when the shop isn’t open.",
    turnOn: "Turn on notifications",
    turnOff: "Turn off",
    test: "Send a test",
    testSent: "Sent. It should appear in a few seconds.",
    blocked:
      "Notifications are blocked for this site. Allow them in the browser’s site settings (the icon beside the address), then come back here.",
    iphone: "On an iPhone, first add the shop to your Home Screen (Share, then Add to Home Screen), open it from there, and turn notifications on.",
    unsupported: "This browser can’t show notifications from websites. Chrome can.",
    denied: "Notifications weren’t allowed. Tap Turn on again and choose Allow.",
    failed: "Couldn’t turn on notifications. Please try again.",
  },
  mr: {
    title: "या डिव्हाइसवर सूचना",
    off: "दुकान उघडे नसतानाही ऑर्डर, वितरण आणि पेमेंटचे अपडेट या फोन किंवा संगणकावर मिळवा.",
    offStaff: "कामाचे ठिकाण उघडे नसतानाही नवीन ऑर्डर आणि अपडेट या फोन किंवा संगणकावर मिळवा.",
    on: "या डिव्हाइसवर सुरू आहे. दुकान उघडे नसतानाही अपडेट येतील.",
    turnOn: "सूचना सुरू करा",
    turnOff: "बंद करा",
    test: "चाचणी पाठवा",
    testSent: "पाठवली. काही सेकंदांत दिसेल.",
    blocked: "या साइटसाठी सूचना बंद आहेत. ब्राउझरच्या साइट सेटिंग्जमध्ये (पत्त्याशेजारील चिन्ह) त्या सुरू करा आणि परत या.",
    iphone: "iPhone वर आधी दुकान होम स्क्रीनवर जोडा (Share, मग Add to Home Screen), तिथून उघडा आणि मग सूचना सुरू करा.",
    unsupported: "हा ब्राउझर वेबसाइटच्या सूचना दाखवू शकत नाही. Chrome दाखवू शकतो.",
    denied: "सूचनांना परवानगी दिली नाही. पुन्हा सुरू करा दाबा आणि Allow निवडा.",
    failed: "सूचना सुरू करता आल्या नाहीत. पुन्हा प्रयत्न करा.",
  },
};

const keyBytes = (key: string) => Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const sameKey = (a: ArrayBuffer | null, b: Uint8Array) =>
  Boolean(a) && new Uint8Array(a!).length === b.length && new Uint8Array(a!).every((byte, i) => byte === b[i]);

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }))
  );
}

/**
 * Turns push notifications on or off for this browser. Chrome's permission prompt only appears
 * after a tap on Turn on. Push itself is off (and this card hidden) until the VAPID keys are set.
 */
export function PushSettings({
  publicKey,
  account,
  mr,
  staff = false,
  id,
}: {
  publicKey: string | null;
  account: string;
  mr: boolean;
  /** Staff hear about new orders, so the card says so. */
  staff?: boolean;
  /** The anchor the workspace search links to. */
  id?: string;
}) {
  const text = words[mr ? "mr" : "en"];
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let live = true;
    (async () => {
      const iphone = /iPhone|iPad/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !window.isSecureContext) {
        // an iPhone gets push only in the app added to its home screen
        if (live) setState(iphone ? "iphone" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (live) setState("blocked");
        return;
      }
      const subscription = await (await registration()).pushManager.getSubscription();
      const mine = subscription && Notification.permission === "granted" ? await pushDeviceIsMineAction(subscription.endpoint) : false;
      if (live) setState(mine ? "on" : "off");
    })().catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, [publicKey]);

  if (!publicKey) return null;

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        if (permission !== "denied") setMessage({ ok: false, text: text.denied });
        return;
      }
      const key = keyBytes(publicKey!);
      const reg = await registration();
      let subscription = await reg.pushManager.getSubscription();
      // made with an older key: start again with the current one
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const result = await turnOnPushAction(subscription.toJSON());
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      try {
        localStorage.setItem(PUSH_OWNER_KEY, account);
      } catch {
        // private window: the check in ServiceWorker asks the server instead
      }
      setState("on");
    } catch {
      setMessage({ ok: false, text: text.failed });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await turnOffPushAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPushAction();
      setMessage(result.ok ? { ok: true, text: text.testSent } : { ok: false, text: result.error });
    } finally {
      setBusy(false);
    }
  }

  const on = state === "on";
  const Icon = state === "blocked" || state === "unsupported" ? BellOff : BellRing;
  return (
    <section className={`panel push-card${on ? " is-on" : ""}`} id={id} aria-labelledby="push-title">
      <span className="push-card-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <div className="push-card-text">
        <h2 id="push-title">{text.title}</h2>
        <p className="muted">
          {state === "on"
            ? text.on
            : state === "blocked"
              ? text.blocked
              : state === "iphone"
                ? text.iphone
                : state === "unsupported"
                  ? text.unsupported
                  : staff
                    ? text.offStaff
                    : text.off}
        </p>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "success-message" : "error-message"}>
            {message.text}
          </p>
        )}
      </div>
      <div className="push-card-actions">
        {(state === "off" || state === "checking") && (
          <button type="button" className="primary-button" onClick={turnOn} disabled={busy || state === "checking"}>
            {text.turnOn}
          </button>
        )}
        {on && (
          <>
            <button type="button" className="secondary-button" onClick={test} disabled={busy}>
              {text.test}
            </button>
            <button type="button" className="text-button" onClick={turnOff} disabled={busy}>
              {text.turnOff}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
