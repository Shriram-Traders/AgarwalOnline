import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/lib/catalog/queries";
import { aisleDescription, aisleSummary, clip, jsonLd, productDescription, productJsonLd, storeJsonLd, websiteJsonLd } from "../src/lib/seo";

const origin = "https://agarwalonline.in";
const pen = {
  slug: "ball-pen",
  name: { en: "Ball Pen", mr: "बॉल पेन" },
  description: { en: "A pen", mr: "पेन" },
  brand: "",
  categorySlug: "writing",
  rating: 0,
  reviewCount: 0,
  variants: [
    { id: "a", sku: "ST-001", label: "Pack of 5", pricePaise: 5500, mrpPaise: 6000, available: 3, maxQuantity: 5 },
    { id: "b", label: "Pack of 10", pricePaise: 9900, mrpPaise: 9900, available: 0, maxQuantity: 5 },
  ],
} as CatalogItem;

describe("Search engine data", () => {
  it("describes every pack of a product, with absolute photo links", () => {
    const [product, crumbs] = productJsonLd(pen, origin, "Writing", ["/api/evidence/abc", "https://images.example/x.jpg"]);
    expect(product.image).toEqual([`${origin}/api/evidence/abc`, "https://images.example/x.jpg"]);
    expect(product).not.toHaveProperty("brand");
    expect(product).not.toHaveProperty("aggregateRating");
    expect(product.category).toBe("Writing");
    expect(product.offers.map((offer) => ("sku" in offer ? offer.sku : null))).toEqual(["ST-001", null]);
    expect(product.offers.map((offer) => [offer.name, offer.price, offer.availability])).toEqual([
      ["Pack of 5", "55.00", "https://schema.org/InStock"],
      ["Pack of 10", "99.00", "https://schema.org/OutOfStock"],
    ]);
    expect(crumbs.itemListElement.map((crumb) => [crumb.position, crumb.item])).toEqual([
      [1, `${origin}/catalog`],
      [2, `${origin}/catalog?category=writing`],
      [3, `${origin}/products/ball-pen`],
    ]);
  });

  it("shows a rating only once there are verified reviews", () => {
    const [product] = productJsonLd({ ...pen, brand: "Writewell", rating: 4.5, reviewCount: 2 }, origin, "Writing", []);
    expect(product).toMatchObject({ brand: { name: "Writewell" }, aggregateRating: { ratingValue: 4.5, reviewCount: 2 } });
    expect(product).not.toHaveProperty("image");
  });

  it("leaves out store details the owner hasn't saved", () => {
    const store = storeJsonLd({ legalName: "Agarwal General Stores", address: "Nagothane, Raigad" }, ["Nagothane"], origin);
    expect(store).not.toHaveProperty("telephone");
    expect(store.areaServed).toEqual([{ "@type": "Place", name: "Nagothane" }]);
    expect(store.alternateName).toEqual(expect.arrayContaining(["Agarwal Store", "Agarwal Stores", "Agrawal General Store"]));
    expect(storeJsonLd({ legalName: "A", address: "B", phone: "9000000000" }, [], origin).telephone).toBe("+919000000000");
  });

  it("names the site for Google's result titles, at the home page address", () => {
    expect(websiteJsonLd(origin)).toMatchObject({ "@type": "WebSite", name: "Agarwal Online", url: `${origin}/` });
  });

  it("can't be broken out of its script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("Search snippets", () => {
  const book = (brand: string, pricePaise: number) => ({ brand, variants: [{ ...pen.variants[0], pricePaise }] });

  it("cuts long text at a word, within Google's 160 characters", () => {
    expect(clip("short text")).toBe("short text");
    const cut = clip("word ".repeat(60));
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut).toMatch(/word…$/);
  });

  it("starts a product snippet with what it is and costs, and always ends with local delivery", () => {
    const long = { ...pen, description: { en: "A very smooth pen. ".repeat(20), mr: "" } };
    const text = productDescription(long);
    expect(text.startsWith("Ball Pen (Pack of 5), ₹55.")).toBe(true);
    expect(text.endsWith("Same-day home delivery in Nagothane.")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it("sums an aisle up from its products: most-stocked brands first, and the price range", () => {
    const books = [book("Sulabh", 9000), book("Sulabh", 24000), book("Classmate", 18000), book("", 12000)];
    expect(aisleSummary(books)).toEqual({ count: 4, brands: ["Sulabh", "Classmate"], range: "₹90–₹240" });
    expect(aisleDescription("Long Books", books)).toBe(
      "Long Books at Agarwal Online: 4 products from Sulabh and Classmate, ₹90–₹240. Same-day home delivery in Nagothane.",
    );
    const many = ["A", "B", "C", "D", "E"].map((b) => book(b, 5000));
    expect(aisleDescription("Pens", many)).toContain("from A, B, C, D and more, ₹50.");
    // a long aisle name gives way; the delivery line never does
    const long = aisleDescription("Very Long Aisle Name ".repeat(8), many);
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("Same-day home delivery in Nagothane.")).toBe(true);
  });
});
