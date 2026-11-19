import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qrModules, qrPath } from "../src/lib/qr";

// The UPI QR code riders show at the door (src/lib/qr.ts). On a Mac, Apple's own QR reader
// (tests/qr-read.swift, through Core Image) reads every version back; elsewhere only the shape is checked.
const TEXTS = [
  "A",
  "upi://pay?pa=agarwal%40okaxis&pn=Agarwal%20Online&am=120.00&cu=INR&tn=Order%20AGS-20261107-00031",
  // long enough for version 8, with two blocks of each length interleaved
  "upi://pay?pa=shriramtraders.nagothane%40okhdfcbank&pn=Agarwal%20General%20Stores%20Nagothane&am=12345.50&cu=INR&tn=Order%20AGS-20261118-00412",
  ...[20, 45, 80, 115, 170, 200].map((n) => "x".repeat(n - 6) + String(n).padStart(6, "-")),
  "Bill — ₹120 · नमस्ते",
];
const swift = process.platform === "darwin" && spawnSync("swift", ["--version"]).status === 0;

describe("QR codes", () => {
  it("picks the smallest version that fits, up to version 10", () => {
    expect(qrModules("A")).toHaveLength(21);
    expect(qrModules("x".repeat(200))).toHaveLength(57);
    expect(() => qrModules("x".repeat(214))).toThrow("Too long");
    const { d, size } = qrPath("A");
    expect(size).toBe(29);
    // the top-left finder's corner, inside the quiet border
    expect(d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });

  it.skipIf(!swift)("reads back as the same text in Apple's QR reader, at every version", () => {
    const dir = mkdtempSync(join(tmpdir(), "qr-"));
    const file = join(dir, "codes.json");
    writeFileSync(file, JSON.stringify(TEXTS.map((text) => ({ text, rows: qrModules(text).map((row) => row.map((dark) => (dark ? "1" : "0")).join("")) }))));
    const out = execFileSync("swift", [join(__dirname, "qr-read.swift"), file], { encoding: "utf8", timeout: 120_000 });
    expect(out.split("\n").filter((line) => line.startsWith("FAIL"))).toEqual([]);
    expect(out.match(/^PASS/gm)).toHaveLength(TEXTS.length);
  }, 180_000);
});
