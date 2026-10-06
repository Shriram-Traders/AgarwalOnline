// The address a phone on the same Wi-Fi uses to reach this PC: its private IPv4 address.
// A PC can have several adapters (Ethernet, VPN, virtual switches); the phone is on the Wi-Fi one.
import { networkInterfaces } from "node:os";

const privateRange = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function wifiAddress() {
  const found = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal && privateRange.test(entry.address))
      .map((entry) => ({ name, address: entry.address })),
  );
  return (found.find((entry) => /wi-?fi|wlan|wireless/i.test(entry.name)) ?? found[0])?.address;
}
