// `npm run phone`: the shop at full speed on a phone on the same Wi-Fi.
//
// The dev server (`npm run dev:lan`) compiles each page the first time it's opened and sends
// large unminified scripts, which a phone feels. This runs a production build instead: every
// page compiled up front, scripts minified and split. Production refuses a plain http address
// (sign-in cookies are secure-only), so the phone reaches it over https on this PC's Wi-Fi
// address, with a certificate this PC makes for itself in .local/phone-cert. The first visit
// shows Chrome's "Your connection is not private": tap Advanced, then Proceed.
//
// The build is redone only when the code changed since the last one (`--build` forces it).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { join } from "node:path";
import { wifiAddress } from "./lan.mjs";

const phonePort = Number(process.env.PHONE_PORT ?? 3443);
const innerPort = Number(process.env.PHONE_INNER_PORT ?? 3100);
const address = wifiAddress();
if (!address) {
  console.error("No Wi-Fi address found. Connect this PC to the same Wi-Fi as the phone and try again.");
  process.exit(1);
}
const origin = `https://${address}:${phonePort}`;

// ---- certificate for this PC's Wi-Fi address (made again when the address changes) ----
function openssl() {
  const candidates = [
    "openssl",
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
  ];
  return candidates.find((file) => spawnSync(file, ["version"], { stdio: "ignore" }).status === 0);
}
const certDir = join(".local", "phone-cert");
const keyFile = join(certDir, "key.pem");
const certFile = join(certDir, "cert.pem");
const forFile = join(certDir, "address.txt");
if (!existsSync(certFile) || !existsSync(forFile) || readFileSync(forFile, "utf8") !== address) {
  const tool = openssl();
  if (!tool) {
    console.error("openssl wasn't found. It comes with Git for Windows; install that, or add openssl to PATH.");
    process.exit(1);
  }
  mkdirSync(certDir, { recursive: true });
  execFileSync(tool, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825",
    "-keyout", keyFile, "-out", certFile,
    "-subj", "/CN=Agarwal store on this PC",
    "-addext", `subjectAltName=IP:${address},IP:127.0.0.1,DNS:localhost`,
  ], { stdio: "ignore" });
  writeFileSync(forFile, address);
}

// ---- production build, only when the code is newer than the last build ----
function newest(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path).reduce((latest, name) => Math.max(latest, newest(join(path, name))), stat.mtimeMs);
}
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const built = existsSync(join(".next", "BUILD_ID")) ? statSync(join(".next", "BUILD_ID")).mtimeMs : 0;
const changed = Math.max(
  ...["src", "public", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json"].map(newest),
);
if (process.argv.includes("--build") || changed > built) {
  console.log(built ? "\n  The code changed since the last build: building again (1–3 minutes).\n" : "\n  First run: building the shop (1–3 minutes).\n");
  const build = spawnSync(process.execPath, [next, "build"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// ---- the shop itself, on this PC only; the phone comes in through the https door below ----
// next start sets NODE_ENV itself, and warns when it's already set to something else
const env = { ...process.env, APP_ORIGIN: origin };
delete env.NODE_ENV;
const shop = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(innerPort)], {
  stdio: "inherit",
  env,
});
shop.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shop.kill(signal));

// ---- https on the Wi-Fi, passed through to the shop as it came (same Host, marked https) ----
const agent = new http.Agent({ keepAlive: true });
https
  .createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: innerPort,
        method: req.method,
        path: req.url,
        agent,
        headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-for": req.socket.remoteAddress ?? "" },
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.statusMessage, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("The shop is still starting. Try again in a few seconds.");
    });
    req.pipe(upstream);
  })
  .listen(phonePort, "0.0.0.0", () => {
    console.log(
      `\n  Phone (same Wi-Fi): ${origin}\n` +
        `  The first time, Chrome says "Your connection is not private": tap Advanced, then Proceed.\n` +
        `  This PC can use the same address. Sign in there, not on localhost, while this runs.\n`,
    );
  });

// a first visit as soon as the shop is up, so the database connection is warm for the phone
void (async () => {
  for (let tries = 0; tries < 120; tries++) {
    try {
      await fetch(`http://127.0.0.1:${innerPort}/`, { signal: AbortSignal.timeout(30_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
})();
