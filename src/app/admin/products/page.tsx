import Image from "next/image";
import Link from "next/link";
import { PackageOpen, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Category, InventoryItem, Product, ProductVariant } from "@/lib/db/models";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { AisleIcon } from "@/components/aisle-icon";
export const metadata = { title: "Catalog", robots: { index: false } };

const LOW = 10;
const STATUSES = [
  ["published", "Live in the shop"],
  ["pending", "Waiting for approval"],
  ["approved", "Approved, not live"],
  ["draft", "Draft"],
  ["rejected", "Rejected"],
] as const;

export default async function Products({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage("catalog:write");
  const params = await searchParams;
  // ponytail: filters run in memory; move them into the query once the catalog passes a few hundred products
  const [categories, products, variants, stock] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Product.find({}).sort({ "name.en": 1 }).limit(500),
    ProductVariant.find({}).limit(2000),
    InventoryItem.find({}).limit(2000),
  ]);
  const available = new Map(
    stock.map((item) => [String(item.variantId), Math.max(0, item.onHand - item.reserved)]),
  );
  const rows = products.map((product) => {
    const packs = variants.filter((variant) => String(variant.productId) === String(product._id));
    return {
      product,
      packs,
      available: packs.reduce((sum, pack) => sum + (available.get(String(pack._id)) ?? 0), 0),
      category: categories.find((category) => String(category._id) === String(product.categoryId)),
    };
  });
  const q = params.q?.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!q ||
        [row.product.name.en, row.product.name.mr, row.product.brand ?? "", ...row.packs.map((pack) => pack.sku)].some(
          (text) => text.toLowerCase().includes(q),
        )) &&
      (!params.category || row.category?.slug === params.category) &&
      (!params.status || row.product.status === params.status) &&
      (params.stock !== "low" || (row.available > 0 && row.available <= LOW)) &&
      (params.stock !== "out" || row.available === 0) &&
      (!params.audience ||
        (params.audience === "schools" && row.product.showToSchools === true) ||
        (params.audience === "schools-only" && row.product.showToSchools === true && row.product.showToCustomers === false) ||
        (params.audience === "customers-only" && row.product.showToSchools !== true)),
  );
  const filtered = Boolean(q || params.category || params.status || params.stock || params.audience);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Products"
        lead="Everything on your shelves. Open a product to change its details, photos or prices."
        aside={
          <Link href="/admin/products/new" className="primary-button">
            <Plus size={18} aria-hidden="true" /> Add a product
          </Link>
        }
      />
      <CatalogAdminNav />
      <FilterBar label="Filter products" submitLabel="Show products" clearHref={filtered ? "/admin/products" : undefined}>
        <label>
          Search <small>name, brand or SKU</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Aisle
          <select name="category" defaultValue={params.category ?? ""}>
            <option value="">All aisles</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name.en}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stock
          <select name="stock" defaultValue={params.stock ?? ""}>
            <option value="">Any stock</option>
            <option value="low">Running low ({LOW} or fewer)</option>
            <option value="out">Sold out</option>
          </select>
        </label>
        <label>
          Who sees it
          <select name="audience" defaultValue={params.audience ?? ""}>
            <option value="">Everyone</option>
            <option value="customers-only">Customers only</option>
            <option value="schools">Offered to schools</option>
            <option value="schools-only">Schools only</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{shown.length}</strong> of {rows.length} products
        </span>
      </p>
      <DataTable
        caption="Products with price, stock and status"
        rows={shown}
        rowKey={(row) => String(row.product._id)}
        columns={[
          {
            header: "Product",
            cell: ({ product, category }) => {
              const image = product.image ?? productImages[product.slug];
              return (
                <span className="product-cell">
                  <span className={`product-thumb${image ? "" : " quiet"}`}>
                    {image ? (
                      <Image src={image} alt="" width={44} height={44} />
                    ) : (
                      <AisleIcon slug={product.categorySlug} />
                    )}
                  </span>
                  <span>
                    <Link href={`/admin/products/${product._id}`}>{product.name.en}</Link>
                    <small>
                      {category?.name.en ?? product.categorySlug}
                      {product.brand ? ` · ${product.brand}` : ""}
                      {product.showToSchools === true
                        ? product.showToCustomers === false
                          ? " · Schools only"
                          : " · Schools too"
                        : ""}
                    </small>
                  </span>
                </span>
              );
            },
          },
          {
            header: "Price",
            numeric: true,
            cell: ({ packs }) =>
              packs.length === 0 ? (
                "No pack yet"
              ) : packs.length === 1 ? (
                <>
                  {formatPrice(packs[0].pricePaise)}
                  {packs[0].mrpPaise > packs[0].pricePaise && <del> {formatPrice(packs[0].mrpPaise)}</del>}
                </>
              ) : (
                `${packs.length} packs from ${formatPrice(Math.min(...packs.map((pack) => pack.pricePaise)))}`
              ),
          },
          {
            header: "In stock",
            numeric: true,
            cell: ({ available: count }) =>
              count === 0 ? (
                <StatusPill tone="bad">Sold out</StatusPill>
              ) : count <= LOW ? (
                <StatusPill tone="warn">{count} left</StatusPill>
              ) : (
                count
              ),
          },
          {
            header: "Status",
            cell: ({ product }) => (
              <StatusPill value={product.status}>
                {STATUSES.find(([value]) => value === product.status)?.[1] ?? product.status}
              </StatusPill>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={PackageOpen}
            title={filtered ? "No products match" : "No products yet"}
            body={filtered ? "Try another name, aisle or stock filter." : "Add your first product to start selling."}
            action={
              filtered ? (
                <Link href="/admin/products" className="secondary-button">
                  Clear filters
                </Link>
              ) : (
                <Link href="/admin/products/new" className="primary-button">
                  Add a product
                </Link>
              )
            }
            heading="h3"
          />
        }
      />
    </section>
  );
}
