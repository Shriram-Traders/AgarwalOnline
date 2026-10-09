import type { MetadataRoute } from "next";

/**
 * What Chrome needs to offer "Install app": a name, icons, where the app starts and that it opens
 * in its own window. The icons are drawn from src/app/icon.svg (rounded) and, for phones that cut
 * their own shape, a full-bleed copy with the letter inside the safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agarwal General Stores",
    short_name: "Agarwal",
    description:
      "Stationery, school supplies, gifts and party essentials from Agarwal General Stores, delivered same day in Nagothane.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // the same colour as the browser bar (viewport.themeColor in the root layout)
    theme_color: "#0f172a",
    lang: "en-IN",
    categories: ["shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // a long press on the app icon
    shortcuts: [
      { name: "Shop all", url: "/catalog" },
      { name: "Basket", url: "/cart" },
      { name: "My orders", url: "/account/orders" },
    ],
  };
}
