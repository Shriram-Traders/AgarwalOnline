import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./playful.css";
import { PlayfulFx } from "@/components/playful";
import { NavProgress } from "@/components/nav-progress";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { liveAreaNames } from "@/lib/commerce/areas";
import { AdaptiveShell } from "@/components/adaptive-shell";
import { currentLocale } from "@/lib/i18n";
import { catalog, catalogCategories } from "@/lib/catalog/queries";
import { currentUser } from "@/lib/auth/session";
import { staffHome, staffRoleOf } from "@/lib/auth/permissions";
import { cartFor } from "@/lib/commerce/service";
import { BasketProvider } from "@/components/basket";
import { KeyboardAware } from "@/components/keyboard-aware";
import { ServiceWorker } from "@/components/service-worker";
import { pushPublicKey } from "@/lib/push/service";
import { getEnv } from "@/lib/env";
import { shopSettings } from "@/lib/settings/shop";

const display = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});
/** Devanagari for Marathi. Latin never reaches it: it sits behind Jakarta in the stack. */
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

// a function, not a constant: the site's address comes from the environment at request time, and the
// title and description from Customize → Shop front
export async function generateMetadata(): Promise<Metadata> {
  const front = await shopSettings("storefront");
  return {
    // resolves the relative canonical and share-image links pages set
    metadataBase: new URL(getEnv().APP_ORIGIN),
    title: {
      default: front.seoTitle,
      template: "%s | Agarwal Online",
    },
    description: front.seoDescription,
    // the app's name and look once it is added to an iPhone's home screen (Chrome reads app/manifest.ts)
    appleWebApp: { capable: true, title: "Agarwal", statusBarStyle: "default" },
    // the WhatsApp/Facebook link preview; product pages swap in their own photo
    openGraph: {
      type: "website",
      siteName: "Agarwal Online",
      locale: "en_IN",
      images: ["/icons/icon-512.png"],
    },
  };
}
export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light",
  // the safe-area insets the pinned bars pad for are only reported when the page claims the whole screen
  viewportFit: "cover",
};

/** The shopper's stored basket, and the server's clock just before it was read: a save confirmed after that isn't in it. */
async function storedBasket(userId?: string) {
  const at = Date.now();
  const lines = userId ? await cartFor(userId) : await (await import("@/lib/commerce/guest-cart")).guestCartLines();
  return { at, lines };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, categories, user, areas, products] = await Promise.all([
    currentLocale(),
    catalogCategories(),
    currentUser(),
    liveAreaNames(),
    catalog(),
  ]);
  // "Offers" and "Deals" only when something really sells below MRP (from the cached shelf, no extra read)
  const onOffer = products.some((product) => product.variants.some((v) => v.pricePaise < v.mrpPaise));
  const staffRole = staffRoleOf(user?.roles ?? []);
  const { at: basketAt, lines: basket } = await storedBasket(user?.id);
  return (
    <html
      lang={locale}
      className={`${display.variable} ${devanagari.variable}`}
      data-scroll-behavior="smooth"
      // the playful skin (src/app/playful.css); delete this line for the classic look
      data-look="playful"
    >
      <body>
        <PlayfulFx />
        {/* reads the search params, so it waits for them rather than holding up the page */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {/* keeps Chrome's install offer for the Get the app page, whichever page it fires on */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'addEventListener("beforeinstallprompt",function(e){window.__installPrompt=e});addEventListener("appinstalled",function(){window.__installPrompt=undefined;window.__appInstalled=true})',
          }}
        />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <KeyboardAware />
        <ServiceWorker account={user && pushPublicKey() ? user.id : null} />
        <BasketProvider
          at={basketAt}
          lines={Object.fromEntries(
            basket.map((line) => [
              line.variantId,
              { quantity: line.quantity, pricePaise: line.pricePaise },
            ]),
          )}
        >
          <AdaptiveShell
            staffRole={staffRole}
            staffUser={user && staffRole ? { name: user.name, phone: user.phone, email: user.email } : null}
            locale={locale}
            header={<Header locale={locale} categories={categories} offers={onOffer} />}
            footer={
              <SiteFooter
                locale={locale}
                categories={categories}
                areas={areas}
                offers={onOffer}
                signedIn={Boolean(user)}
                workspace={user ? staffHome(user.roles) : null}
              />
            }
            staffFooter={<SiteFooter locale={locale} categories={categories} areas={areas} compact />}
          >
            {children}
          </AdaptiveShell>
        </BasketProvider>
      </body>
    </html>
  );
}
