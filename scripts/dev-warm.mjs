// `npm run dev:warm`: the dev server, plus a quiet first visit to the main pages as soon as it's
// ready, so they're compiled before anyone clicks. In development each page compiles the first
// time it's opened, which took 10–25 s per page here; after this the first click is as quick as
// the second. Production (next build) compiles everything up front and doesn't need this.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const port = process.env.PORT ?? "3000";
const base = `http://127.0.0.1:${port}`;
// the pages people open first; signed-in pages compile even though they send a guest to sign in
const pages = [
  "/",
  "/catalog",
  "/products/warm-up",
  "/cart",
  "/checkout",
  "/login",
  "/signup",
  "/account",
  "/account/orders",
  "/account/wishlist",
  "/admin",
  "/admin/products",
  "/super-admin",
];

// Next's own entry point run by this node: no shell in between, so nothing to escape
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--hostname", "127.0.0.1", "--port", port], {
  stdio: ["inherit", "pipe", "inherit"],
  env: process.env,
});

let warming = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!warming && /Ready in/.test(String(chunk))) {
    warming = true;
    void warm();
  }
});

async function warm() {
  const started = Date.now();
  // one at a time: compiling several pages at once is slower than one after another
  for (const page of pages) {
    try {
      await fetch(`${base}${page}`, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
    } catch {
      // a page that fails here fails the same way when opened; the server log says why
    }
  }
  console.log(`\n  Warmed up ${pages.length} pages in ${Math.round((Date.now() - started) / 1000)} s: first clicks are fast now.\n`);
}

child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
