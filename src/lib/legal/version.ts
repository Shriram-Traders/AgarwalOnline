/**
 * One version for all five policy pages. Bump it (to that day's date, with .2, .3 for another
 * change the same day) whenever their wording changes, never otherwise: checkout then asks for
 * the box to be ticked again, and every order keeps the version it was placed under. Earlier
 * wording stays in git history.
 *
 * 2026-10-10.2: family accounts and the family tab, children's details, push notifications and
 * the installable app, Hostinger for email.
 *
 * 2026-10-15.1: matched to the code again: 30-day sign-in sessions, MiniMoth sends codes by WhatsApp
 * or SMS, voice search through the browser, Google's sign-in tokens, sign-in attempt records,
 * prices include all taxes.
 *
 * 2026-10-16.1: only what is live: the family tab (khata) is gone, cash on delivery is the only way
 * to pay (no Razorpay text), and the switched-off shop assistant isn't mentioned. Shipping says
 * "shown above" only when an area list is above it.
 *
 * 2026-10-31.1: providers: some items are provided by other local shops and say so; Agarwal still
 * sells, bills, delivers and handles returns, and those shops don't receive customers' details.
 *
 * 2026-11-07.1: Google Analytics, only after the shopper taps Allow: what it sees, its _ga cookies,
 * 2 months' retention at Google, and Cookie choices to change the answer.
 *
 * 2026-11-07.2: no cookie question after all (the owner's call: the shop serves Raigad only):
 * Google Analytics runs for every shopper, and the policy says how to block it.
 *
 * 2026-11-12.1: English only. The Marathi versions are gone, and with them the line that the English
 * version prevails, the language cookie and "language" among account details.
 *
 * 2026-11-17.1: one delivery code per order: on the order page from the start, the same code sent
 * by MiniMoth when the order leaves the shop and on every resend, worked out rather than stored, and
 * a few tries at a time instead of a five-minute expiry.
 */
export const POLICY_VERSION = "2026-11-17.1";
export const LAST_UPDATED = { en: "17 November 2026", mr: "17 नोव्हेंबर 2026" } as const;
