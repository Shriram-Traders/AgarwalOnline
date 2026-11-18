import Image from "next/image";
import Link from "next/link";
import { PackageOpen, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Category, InventoryItem, Product, ProductVariant } from "@/lib/db/models";
import { isLow } from "@/lib/inventory/low-stock";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { PageHeading } from "@/components/page-heading";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { ShowMore, rowsShown } from "@/components/show-more";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { AisleIcon } from "@/components/aisle-icon";
export const metadata = { title: "Catalog", robots: { index: false } };

const STATUSES = [
  ["published", "Live in the shop"],
  ["pending", "Waiting for approval"],
  ["approved", "Approved, not live"],
  ["draft", "Draft"],
  ["rejected", "Rejected"],
] as const;

import { Provider } from "@/lib/providers/models";
import { notDeleted } from "@/lib/catalog/deleted";
import { normalizeSearch, searchWords } from "@/lib/catalog/search";

export default async function Products({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage("catalog:write");
  const params = await searchParams;
  // ponytail: filters run in memory; move them into the query once the catalog passes a few hundred products
  const [categories, products, variants, stock, providers] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Product.find(notDeleted).sort({ "name.en": 1 }).limit(500),
    ProductVariant.find(notDeleted).limit(2000),
    InventoryItem.find({}).limit(2000),
    Provider.find({}).sort({ name: 1 }).select("name town").lean<{ _id: unknown; name: string; town: string }[]>(),
  ]);
  const providerOf = (product: { providerId?: unknown }) =>
    product.providerId ? providers.find((provider) => String(provider._id) === String(product.providerId)) : undefined;
  const available = new Map(
    stock.map((item) => [String(item.variantId), Math.max(0, item.onHand - item.reserved)]),
  );
  const alertBelow = new Map(stock.map((item) => [String(item.variantId), item.alertBelow as number | undefined]));
  const rows = products.map((product) => {
    const packs = variants.filter((variant) => String(variant.productId) === String(product._id));
    return {
      product,
      packs,
      available: packs.reduce((sum, pack) => sum + (available.get(String(pack._id)) ?? 0), 0),
      // running low when any of its packs is, by that pack's own alert level
      low: packs.some((pack) => isLow(available.get(String(pack._id)) ?? 0, alertBelow.get(String(pack._id)))),
      category: categories.find((category) => String(category._id) === String(product.categoryId)),
    };
  });
  const q = params.q?.trim();
  // every word typed must be found, in any order, as the shop's search does: plurals, the shop's synonyms
  // (vahi, kalam) and Marathi aliases count, and so does the category's name ("namkeen" finds every sev)
  const words = q ? searchWords(q) : [];
  const found = (row: (typeof rows)[number]) => {
    const text = normalizeSearch(
      [row.product.name.en, row.product.name.mr, row.product.brand ?? "", row.category?.name.en ?? "", ...(row.product.aliases ?? []), ...row.packs.map((pack) => pack.sku)].join(" "),
    );
    return words.every((alternatives) => alternatives.some((word) => text.includes(word)));
  };
  const shown = rows.filter(
    (row) =>
      (!q || found(row)) &&
      (!params.category || row.category?.slug === params.category) &&
      (!params.provider ||
        (params.provider === "own" ? !row.product.providerId : String(row.product.providerId ?? "") === params.provider)) &&
      (!params.status || row.product.status === params.status) &&
      (params.stock !== "low" || row.low) &&
      (params.stock !== "out" || row.available === 0) &&
      (!params.audience ||
        (params.audience === "schools" && row.product.showToSchools === true) ||
        (params.audience === "schools-only" && row.product.showToSchools === true && row.product.showToCustomers === false) ||
        (params.audience === "customers-only" && row.product.showToSchools !== true)),
  );
  const filtered = Boolean(q || params.category || params.provider || params.status || params.stock || params.audience);
  const page = shown.slice(0, rowsShown(params.show));
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
      {params.deleted && (
        <p className="success-message" role="status">
          Product deleted. Past orders and bills keep it.
        </p>
      )}
      <FilterBar label="Filter products" submitLabel="Show products" clearHref={filtered ? "/admin/products" : undefined}>
        <label>
          Search <small>name, brand or category</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label className="filter-keep">
          Category
          <select name="category" defaultValue={params.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name.en}
              </option>
            ))}
          </select>
        </label>
        {providers.length > 0 && (
          <label>
            Provided by
            <select name="provider" defaultValue={params.provider ?? ""}>
              <option value="">Anyone</option>
              <option value="own">Our own stock</option>
              {providers.map((provider) => (
                <option key={String(provider._id)} value={String(provider._id)}>
                  {provider.name}, {provider.town}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Stock
          <select name="stock" defaultValue={params.stock ?? ""}>
            <option value="">Any stock</option>
            <option value="low">Running low or sold out</option>
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
          {shown.length > page.length ? (
            <>
              Showing <strong>{page.length}</strong> of {shown.length} products
            </>
          ) : (
            <>
              <strong>{shown.length}</strong> of {rows.length} products
            </>
          )}
        </span>
      </p>
      <DataTable
        caption="Products with price, stock and status"
        rows={page}
        exportName="Products"
        exportRows={shown}
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
                      {providerOf(product) ? ` · from ${providerOf(product)!.name}` : ""}
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
            cell: ({ available: count, low }) =>
              count === 0 ? (
                <StatusPill tone="bad">Sold out</StatusPill>
              ) : low ? (
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
            body={filtered ? "Try another name, category or stock filter." : "Add your first product to start selling."}
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
      <ShowMore path="/admin/products" params={params} shown={page.length} total={shown.length} />
    </section>
  );
}
