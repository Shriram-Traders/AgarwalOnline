import Link from "next/link";
import { MapPin } from "lucide-react";
import { LocaleToggle } from "./locale-toggle";
import type { CategoryLink } from "./header";
import type { Locale } from "@/lib/locale-types";

export function SiteFooter({
  locale,
  categories,
}: {
  locale: Locale;
  categories: CategoryLink[];
}) {
  const mr = locale === "mr";
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="Agarwal General Stores, home">
            Agarwal<small>General Stores</small>
          </Link>
          <p>
            {mr
              ? "नागोठण्यातील तुमच्या ओळखीच्या दुकानातून लेखन साहित्य, शालेय वस्तू, भेटवस्तू आणि पार्टी साहित्य."
              : "Stationery, school supplies, gifts and party essentials from your neighbourhood store in Nagothane."}
          </p>
          <p className="footer-areas">
            <MapPin size={14} aria-hidden="true" />
            Nagothane · Roha · Pali · RIL Township · NMD
          </p>
        </div>
        <nav className="footer-shop" aria-label={mr ? "खरेदी" : "Shop"}>
          <h2>{mr ? "खरेदी" : "Shop"}</h2>
          <ul>
            {categories.slice(0, 6).map((category) => (
              <li key={category.slug}>
                <Link href={`/catalog?category=${category.slug}`}>
                  {category[locale]}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/catalog?sort=discount">{mr ? "खास ऑफर" : "Deals"}</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={mr ? "मदत" : "Help"}>
          <h2>{mr ? "मदत" : "Help"}</h2>
          <ul>
            <li>
              <Link href="/serviceability">
                {mr ? "वितरण क्षेत्र तपासा" : "Check delivery area"}
              </Link>
            </li>
            <li>
              <Link href="/account/orders">{mr ? "तुमच्या ऑर्डर" : "Your orders"}</Link>
            </li>
            <li>
              <Link href="/account/support">
                {mr ? "दुकानाशी बोला" : "Talk to the store"}
              </Link>
            </li>
            <li>
              <Link href="/account/complaints">
                {mr ? "तक्रारी आणि परतावा" : "Complaints & returns"}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="footer-store">
          <h2>{mr ? "दुकान" : "Store"}</h2>
          <ul>
            <li>
              <Link href="/login">{mr ? "साइन इन" : "Sign in"}</Link>
            </li>
            <li>
              <Link href="/login">{mr ? "कर्मचारी साइन इन" : "Staff sign in"}</Link>
            </li>
          </ul>
          <LocaleToggle locale={locale} />
        </div>
      </div>
      <div className="footer-base">
        <div className="footer-base-inner">
          <p>© {new Date().getFullYear()} Agarwal General Stores</p>
          <p>
            {mr
              ? "विकास आवृत्ती · काल्पनिक उत्पादने आणि किमती"
              : "Development storefront · Fictional products and prices"}
          </p>
        </div>
      </div>
    </footer>
  );
}
