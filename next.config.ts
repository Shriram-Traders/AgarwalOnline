import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // `npm run dev:lan` (scripts/dev-lan.mjs) serves phones on the same Wi-Fi; Next blocks its dev
  // files for any address it wasn't started on unless it is listed here
  allowedDevOrigins: process.env.DEV_LAN === "true" ? ["192.168.*.*", "10.*.*.*", "172.*.*.*"] : undefined,
  distDir: process.env.NEXT_TEST_BUILD === "true" ? ".next-e2e" : ".next",
  // photos are resized by the services that host them (src/lib/image-loader.ts), not by a paid image service
  images: { loader: "custom", loaderFile: "./src/lib/image-loader.ts" },
  experimental: {
    // photo uploads go through server actions, which refuse bodies over 1 MB by default;
    // photos are shrunk in the browser first (components/photo-input.tsx), this is the safety net.
    // Vercel rejects request bodies over 4.5 MB, so stay under that.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://*.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};
export default config;
