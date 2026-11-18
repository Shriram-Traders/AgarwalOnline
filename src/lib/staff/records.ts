import { hasPermission, type Role } from "@/lib/auth/permissions";
import { connectDB } from "@/lib/db/connect";
import { Category, Product, ProductVariant, User } from "@/lib/db/models";
import { Order } from "@/lib/commerce/models";
import { notDeleted } from "@/lib/catalog/deleted";
import { fuzzyPattern, searchWords, wordPattern } from "@/lib/catalog/search";
import { formatPrice, orderStage } from "@/lib/display";
import { productImages } from "@/lib/catalog/images";

export type RecordKind = "product" | "order" | "customer";
export type RecordHit = { id: string; kind: RecordKind; title: string; hint: string; href: string; image?: string };

const PER_KIND = 6;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STATUS: Record<string, string> = {
  published: "Live in the shop",
  pending: "Waiting for approval",
  approved: "Approved, not live",
  draft: "Hidden",
  rejected: "Rejected",
};

/** Products by name, brand, category, alias or SKU, the shop's way: every word, plurals and synonyms count. */
async function products(raw: string): Promise<RecordHit[]> {
  const words = searchWords(raw);
  const fields = ["name.en", "name.mr", "brand", "aliases", "categorySlug", "slug"];
  const match = (pattern: (alternatives: string[]) => string) => ({
    ...notDeleted,
    $and: words.map((alternatives) => ({ $or: fields.map((field) => ({ [field]: { $regex: pattern(alternatives), $options: "i" } })) })),
  });
  const bySku = await ProductVariant.find({ ...notDeleted, sku: { $regex: escape(raw), $options: "i" } })
    .select("productId")
    .limit(PER_KIND)
    .lean<{ productId: unknown }[]>();
  const select = "slug name brand categorySlug status image";
  type Row = { _id: unknown; slug: string; name: { en: string }; brand?: string; categorySlug: string; status: string; image?: string };
  let rows = await Product.find({ $or: [match(wordPattern), { _id: { $in: bySku.map((v) => v.productId) } }] })
    .select(select)
    .sort({ "name.en": 1 })
    .limit(PER_KIND)
    .lean<Row[]>();
  // nothing as typed: forgive a letter ("ratlam", "bhujiya" for "bhujia")
  if (!rows.length) rows = await Product.find(match((alternatives) => alternatives.map(fuzzyPattern).join("|"))).select(select).limit(PER_KIND).lean<Row[]>();
  const shelves = new Map(
    (await Category.find({ slug: { $in: [...new Set(rows.map((row) => row.categorySlug))] } }).select("slug name.en").lean<{ slug: string; name: { en: string } }[]>()).map(
      (shelf) => [shelf.slug, shelf.name.en],
    ),
  );
  return rows.map((row) => ({
    id: `product.${row._id}`,
    kind: "product",
    title: row.name.en,
    hint: [row.brand, shelves.get(row.categorySlug) ?? row.categorySlug, STATUS[row.status] ?? row.status].filter(Boolean).join(" · "),
    href: `/admin/products/${row._id}`,
    // the main photo, as the products list shows it
    image: row.image ?? productImages[row.slug],
  }));
}

/** Orders by number, the name on the order or its phone number, newest first. */
async function orders(raw: string): Promise<RecordHit[]> {
  const digits = raw.replace(/^\+91[\s-]*/, "").replace(/[\s-]/g, "");
  const term = /^\d{4,10}$/.test(digits) ? digits : raw;
  const pattern = { $regex: escape(term), $options: "i" };
  const rows = await Order.find({ $or: [{ number: pattern }, { "address.name": pattern }, { "address.phone": pattern }] })
    .select("number address.name totalPaise createdAt orderStatus fulfilmentStatus deliveryStatus paymentMethod paymentStatus codStatus")
    .sort({ createdAt: -1 })
    .limit(PER_KIND)
    .lean<
      {
        _id: unknown;
        number: string;
        address?: { name?: string };
        totalPaise: number;
        orderStatus: string;
        fulfilmentStatus?: string;
        deliveryStatus?: string;
        paymentMethod?: string;
        paymentStatus?: string;
        codStatus?: string;
      }[]
    >();
  return rows.map((row) => ({
    id: `order.${row._id}`,
    kind: "order",
    title: row.number,
    hint: [row.address?.name, formatPrice(row.totalPaise), orderStage(row).label].filter(Boolean).join(" · "),
    href: `/admin/orders/${row._id}`,
  }));
}

/** Customers by name, phone or email; the customer list opens on them. */
async function customers(raw: string): Promise<RecordHit[]> {
  const digits = raw.replace(/^\+91[\s-]*/, "").replace(/[\s-]/g, "");
  const term = /^\d{4,10}$/.test(digits) ? digits : raw;
  const pattern = { $regex: escape(term), $options: "i" };
  const rows = await User.find({ roles: "customer", $or: [{ name: pattern }, { phone: pattern }, { email: pattern }] })
    .select("name phone email")
    .sort({ createdAt: -1 })
    .limit(PER_KIND)
    .lean<{ _id: unknown; name: string; phone?: string; email?: string }[]>();
  return rows.map((row) => ({
    id: `customer.${row._id}`,
    kind: "customer",
    title: row.name,
    hint: [row.phone, row.email].filter(Boolean).join(" · "),
    href: `/admin/customers?q=${encodeURIComponent(row.phone ?? row.name)}`,
  }));
}

/**
 * Real records for the workspace search, as you type: products, orders and customers, each only
 * for staff allowed to open them. The settings and pages are found in the browser (finder.ts).
 */
export async function findRecords(query: string, roles: readonly Role[]): Promise<RecordHit[]> {
  const raw = query.trim().slice(0, 60);
  if (raw.length < 2) return [];
  await connectDB();
  const lookups: Promise<RecordHit[]>[] = [];
  if (hasPermission(roles, "catalog:write")) lookups.push(products(raw));
  if (hasPermission(roles, "order:manage")) lookups.push(orders(raw), customers(raw));
  return (await Promise.all(lookups)).flat();
}
