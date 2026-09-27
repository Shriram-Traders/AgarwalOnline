import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { AdaptiveShell } from "@/components/adaptive-shell";
import { currentLocale } from "@/lib/i18n";
import { catalogCategories } from "@/lib/catalog/queries";

const body = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
});
const display = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});
/** Devanagari for Marathi. Latin never reaches it: it sits behind Manrope in the stack. */
const devanagari = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-mukta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Agarwal General Stores | Your neighbourhood store, delivered",
    template: "%s | Agarwal General Stores",
  },
  description:
    "Stationery, school supplies, gifts and party essentials from Agarwal General Stores, delivered across Nagothane, Roha, Pali, RIL Township and NMD.",
};
export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, categories] = await Promise.all([
    currentLocale(),
    catalogCategories(),
  ]);
  return (
    <html
      lang={locale}
      className={`${body.variable} ${display.variable} ${devanagari.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AdaptiveShell
          header={<Header locale={locale} categories={categories} />}
          footer={<SiteFooter locale={locale} categories={categories} />}
        >
          {children}
        </AdaptiveShell>
      </body>
    </html>
  );
}
