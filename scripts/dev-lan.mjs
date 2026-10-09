// `npm run dev:lan`: the dev server, opened to phones on the same Wi-Fi at
// http://<this PC's Wi-Fi address>:3000. Sign-in accepts only the site's own address
// (APP_ORIGIN), so for this run that address is the Wi-Fi one, on the phone and on this PC alike.
// For a fast phone (a production build), use `npm run phone` instead.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { wifiAddress } from "./lan.mjs";

const port = process.env.PORT ?? "3000";
const address = wifiAddress();
if (!address) {
  console.error("No Wi-Fi address found. Connect this PC to the same Wi-Fi as the phone and try again.");
  process.exit(1);
}
const origin = `http://${address}:${port}`;
console.log(`\n  Phone (same Wi-Fi): ${origin}\n  This PC:            ${origin}  (sign in on this address while this server runs)\n`);

// Next's own entry point run by this node: no shell in between, so nothing to escape
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--hostname", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, APP_ORIGIN: origin, DEV_LAN: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
