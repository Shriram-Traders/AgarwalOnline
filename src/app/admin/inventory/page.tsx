import Link from "next/link";
import { History, PackageSearch } from "lucide-react";
import mongoose from "mongoose";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { ShowMore, rowsShown } from "@/components/show-more";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MoneyInput } from "@/components/money-input";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { displayStatus } from "@/lib/display";
import { PageHeading } from "@/components/page-heading";
import { StockImport } from "@/components/stock-import";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { requirePage } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { governanceAction } from "@/lib/governance/actions";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { formatPrice } from "@/lib/display";
import { InventoryMovement } from "@/lib/commerce/models";
import { InventoryItem, Product, ProductVariant } from "@/lib/db/models";
import { DEFAULT_ALERT_BELOW, isLow } from "@/lib/inventory/low-stock";
import { shopSettings } from "@/lib/settings/shop";
export const metadata = { title: "Stock", robots: { index: false } };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePage("inventory:adjust");
  // only an owner prices for schools
  const isOwner = hasPermission(user.roles, "settings:write");
  const params = await searchParams;
  const [products, variants, inventory, movements, starts] = await Promise.all([
    Product.find({}).sort({ "name.en": 1 }).limit(500),
    // purchase prices are read for owners only
    ProductVariant.find({}).select(isOwner ? "+costPaise" : "").sort({ sku: 1 }).limit(2000),
    InventoryItem.find({}).limit(2000),
    InventoryMovement.find({}).sort({ at: -1 }).limit(50).populate("variantId", "sku label"),
    // where a new pack starts (Customize → Form defaults)
    shopSettings("defaults"),
  ]);
  const rows = variants.map((variant) => {
    const product = products.find((item) => String(item._id) === String(variant.productId));
    const stock = inventory.find((item) => String(item.variantId) === String(variant._id));
    const onHand = stock?.onHand ?? 0;
    const reserved = stock?.reserved ?? 0;
    const available = Math.max(0, onHand - reserved);
    const ownAlert = stock?.alertBelow as number | undefined;
    return { variant, product, onHand, reserved, available, ownAlert, alertBelow: ownAlert ?? DEFAULT_ALERT_BELOW };
  });
  const q = params.q?.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!q || [row.product?.name.en ?? "", row.variant.sku, row.variant.label].some((text) => text.toLowerCase().includes(q))) &&
      // the same "running low" as the overview, the menu badge and the emailed report: sold out included
      (params.stock !== "low" || isLow(row.available, row.alertBelow)) &&
      (params.stock !== "out" || row.available === 0),
  );
  const page = shown.slice(0, rowsShown(params.show));
  // the pack being adjusted opens above the table, one at a time
  const adjusting =
    params.adjust && mongoose.isValidObjectId(params.adjust)
      ? rows.find((row) => String(row.variant._id) === params.adjust)
      : undefined;
  const filters = new URLSearchParams(
    Object.entries({ q: params.q, stock: params.stock }).filter(([, value]) => value) as [string, string][],
  );
  const adjustHref = (id: string) => `/admin/inventory?${new URLSearchParams({ ...Object.fromEntries(filters), adjust: id })}#adjust`;
  const filtered = Boolean(q || params.stock);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Stock"
        lead="How many of each pack you have, how many are held for open orders, and every change."
        aside={
          <a className="secondary-button" href="/api/staff/export/low-stock" download>
            Low-stock report (Excel)
          </a>
        }
      />
      <CatalogAdminNav />
      {adjusting && (
        <div className="panel adjust-panel" id="adjust">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Adjust stock</span>
              <h2>
                {adjusting.product?.name.en} · {adjusting.variant.label}
              </h2>
            </div>
            <Link href={`/admin/inventory${filters.size ? `?${filters}` : ""}`} className="text-button">
              Close
            </Link>
          </div>
          <p className="muted">
            {adjusting.onHand} on the shelf · {adjusting.reserved} held for open orders · {adjusting.available} can be sold
          </p>
          <ActionForm
            action={governanceAction}
            submit="Record the change"
            confirmMessage={isOwner ? "This changes how many shoppers can buy and is written to the audit trail." : "This changes how many shoppers can buy and is written to the audit trail. Large changes wait for an owner."}
          >
            <input type="hidden" name="operation" value="stock" />
            <input type="hidden" name="variantId" value={String(adjusting.variant._id)} />
            <div className="staff-form-grid">
              <label>
                Change <small>Add with a number, remove with a minus sign: 12 or -3</small>
                {/* a text field: phone number pads have no minus key */}
                <input name="delta" pattern="-?[0-9]+" required autoComplete="off" />
              </label>
              <label>
                Reason <small>For example: new delivery from the supplier, or damaged</small>
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
            </div>
          </ActionForm>
          <ActionForm action={catalogManagementAction} submit="Save alert" buttonClassName="secondary-button">
            <input type="hidden" name="operation" value="alert" />
            <input type="hidden" name="variantId" value={String(adjusting.variant._id)} />
            <label>
              Warn me when fewer than this can be sold{" "}
              <small>0 turns the warning off; blank uses the shop default of {DEFAULT_ALERT_BELOW}</small>
              <input
                name="alertBelow"
                inputMode="numeric"
                pattern="[0-9]{1,6}"
                defaultValue={adjusting.ownAlert ?? ""}
                placeholder={String(DEFAULT_ALERT_BELOW)}
                autoComplete="off"
              />
            </label>
          </ActionForm>
        </div>
      )}
      <details className="panel create-staff" id="stock-sheet" open={params.sheet === "1"}>
        <summary>Update stock from a spreadsheet</summary>
        <StockImport />
      </details>
      <details className="panel create-staff" id="new-pack" open={params.new === "pack"}>
        <summary>Add a pack size</summary>
        <p className="muted">{isOwner ? "It goes on sale as soon as you add it." : "A new pack puts a new price in the shop, so an owner approves it like a price change."}</p>
        <ActionForm action={governanceAction} submit="Add pack size">
          <input type="hidden" name="operation" value="variant" />
          <div className="staff-form-grid">
            <label>
              Product
              {/* every product, hidden ones too: the link from a hidden product used to pre-select a different one */}
              <select name="productId" defaultValue={params.product}>
                {products.map((item) => (
                  <option value={String(item._id)} key={String(item._id)}>
                    {item.name.en}
                    {item.status === "published" ? "" : " (hidden)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              SKU <small>Letters, numbers and dashes</small>
              <input name="sku" pattern="[A-Za-z0-9-]+" spellCheck={false} required />
            </label>
            <label>
              Pack label <small>What shoppers see, like “Pack of 10”</small>
              <input name="label" required />
            </label>
            <label>
              Unit
              <select name="unit">
                {["piece", "kg", "g", "l", "ml"].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              Pack quantity
              <input name="packQuantity" inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" required />
            </label>
            <label>
              Price (₹)
              <MoneyInput name="priceRupees" />
            </label>
            <label>
              MRP (₹)
              <MoneyInput name="mrpRupees" />
            </label>
            <label>
              Most one shopper can buy
              <input name="maxQuantity" inputMode="numeric" pattern="[0-9]+" defaultValue={starts.packOrderLimit} required />
            </label>
            <label>
              Opening stock
              <input name="stock" inputMode="numeric" pattern="[0-9]+" required />
            </label>
            {isOwner && (
              <label>
                School price before GST (₹) <small>Optional</small>
                <MoneyInput name="schoolPriceRupees" required={false} />
              </label>
            )}
            {isOwner && (
              <label>
                Purchase price (₹) <small>Optional; only owners see it</small>
                <MoneyInput name="costRupees" required={false} />
              </label>
            )}
          </div>
        </ActionForm>
      </details>
      <FilterBar label="Filter stock" submitLabel="Show stock" clearHref={filtered ? "/admin/inventory" : undefined}>
        <label>
          Search <small>product, pack or SKU</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Show
          <select name="stock" defaultValue={params.stock ?? ""}>
            <option value="">Every pack</option>
            <option value="low">Running low or sold out</option>
            <option value="out">Sold out</option>
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          {shown.length > page.length ? (
            <>
              Showing <strong>{page.length}</strong> of {shown.length} packs
            </>
          ) : (
            <>
              <strong>{shown.length}</strong> of {rows.length} packs
            </>
          )}
        </span>
      </p>
      <DataTable
        caption="Stock for every pack: on the shelf, held for orders and available to sell"
        rows={page}
        exportName="Stock"
        exportRows={shown}
        rowKey={(row) => String(row.variant._id)}
        columns={[
          {
            header: "Pack",
            cell: ({ product, variant }) => (
              <span className="product-cell">
                <span>
                  {product ? <Link href={`/admin/products/${product._id}`}>{product.name.en}</Link> : "Unknown product"}
                  <small>
                    {variant.label} · <code>{variant.sku}</code>
                    {variant.active === false ? " · hidden pack" : ""}
                  </small>
                </span>
              </span>
            ),
          },
          { header: "On the shelf", numeric: true, cell: ({ onHand }) => onHand },
          { header: "Held for orders", numeric: true, cell: ({ reserved }) => reserved },
          {
            header: "Can be sold",
            numeric: true,
            cell: ({ available, alertBelow }) =>
              available === 0 ? (
                <StatusPill tone="bad">Sold out</StatusPill>
              ) : isLow(available, alertBelow) ? (
                <StatusPill tone="warn">{available} left</StatusPill>
              ) : (
                available
              ),
          },
          { header: "Alert below", numeric: true, phone: "hide", cell: ({ alertBelow }) => (alertBelow === 0 ? "Off" : alertBelow) },
          ...(isOwner
            ? [
                {
                  header: "Bought at",
                  numeric: true,
                  phone: "hide" as const,
                  cell: ({ variant }: (typeof rows)[number]) => (variant.costPaise != null ? formatPrice(variant.costPaise) : "—"),
                },
              ]
            : []),
          {
            header: "Action",
            cell: ({ variant, product }) => (
              <Link href={adjustHref(String(variant._id))} aria-label={`Adjust stock of ${product?.name.en ?? "pack"} ${variant.label}`}>
                Adjust
              </Link>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={PackageSearch}
            title={filtered ? "No packs match" : "No packs yet"}
            body={filtered ? "Try another name or stock filter." : "Add a pack size to start selling a product."}
            heading="h3"
          />
        }
      />
      <ShowMore path="/admin/inventory" params={params} shown={page.length} total={shown.length} />
      <div className="section-heading">
        <div>
          <h2>Recent changes</h2>
          <span className="muted">Sales, releases and adjustments, newest first</span>
        </div>
      </div>
      <DataTable
        caption="Every recorded stock change with time, pack, kind and quantity"
        exportName="Stock changes"
        rows={movements}
        rowKey={(movement) => String(movement._id)}
        columns={[
          { header: "When", cell: (movement) => <When at={movement.at} /> },
          {
            header: "Pack",
            cell: (movement) => {
              const variant = movement.variantId as unknown as { sku?: string; label?: string };
              return (
                <>
                  {variant?.label} · <code>{variant?.sku}</code>
                </>
              );
            },
          },
          { header: "What", cell: (movement) => displayStatus(movement.kind) },
          {
            header: "Change",
            numeric: true,
            cell: (movement) => `${movement.quantity > 0 ? "+" : ""}${movement.quantity}`,
          },
        ]}
        empty={
          <EmptyState
            icon={History}
            title="No changes recorded yet"
            body="Every stock adjustment, sale and release is logged here."
            heading="h3"
          />
        }
      />
    </section>
  );
}
