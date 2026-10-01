// `npm run dev:lan`: the dev server, opened to phones on the same Wi-Fi at
// http://<this PC's Wi-Fi address>:3000. Sign-in accepts only the site's own address
// (APP_ORIGIN), so for this run that address is the Wi-Fi one, on the phone and on this PC alike.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";

const port = process.env.PORT ?? "3000";
const privateRange = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const found = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
  (entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal && privateRange.test(entry.address))
    .map((entry) => ({ name, address: entry.address })),
);
// a PC can have several adapters; the phone is on the Wi-Fi one
const lan = found.find((entry) => /wi-?fi|wlan|wireless/i.test(entry.name)) ?? found[0];
if (!lan) {
  console.error("No Wi-Fi address found. Connect this PC to the same Wi-Fi as the phone and try again.");
  process.exit(1);
}
const origin = `http://${lan.address}:${port}`;
console.log(`\n  Phone (same Wi-Fi): ${origin}\n  This PC:            ${origin}  (sign in on this address while this server runs)\n`);

// Next's own entry point run by this node: no shell in between, so nothing to escape
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--hostname", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, APP_ORIGIN: origin, DEV_LAN: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
