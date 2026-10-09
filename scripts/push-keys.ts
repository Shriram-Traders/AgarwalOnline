// Prints a new VAPID key pair for push notifications. Put the three lines in .env (and in the
// hosting's environment variables), then restart the server. Make the pair once and keep it:
// a new pair means every phone and PC has to turn notifications on again.
import { newVapidKeys } from "../src/lib/push/web-push";

const keys = newVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("# how push services can reach the shop: an email address, or the shop's https address");
console.log("VAPID_SUBJECT=mailto:you@example.com");
