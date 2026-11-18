import Link from "next/link";
import { History, Minus, MoreVertical, PackageSearch, Plus } from "lucide-react";
import mongoose from "mongoose";
import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { ShowMore, rowsShown } from "@/components/show-more";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PackFields } from "@/components/request-fields";
import { Popover } from "@/components/popover";
import { DeleteRow } from "@/components/delete-row";
import { StockChangeDialog } from "@/components/stock-change-dialog";
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
import { notDeleted } from "@/lib/catalog/deleted";
import { ApprovalRequest } from "@/lib/governance/models";
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
  const [products, variants, inventory, movements, starts, waitingDeletes] = await Promise.all([
    Product.find(notDeleted).sort({ "name.en": 1 }).limit(500),
    // purchase prices are read for owners only
    ProductVariant.find(notDeleted).select(isOwner ? "+costPaise" : "").sort({ sku: 1 }).limit(2000),
    InventoryItem.find({}).limit(2000),
    InventoryMovement.find({})
      .sort({ at: -1 })
      .limit(50)
      .populate({ path: "variantId", select: "label productId", populate: { path: "productId", select: "name.en" } }),
    // where a new pack starts (Customize → Form defaults)
    shopSettings("defaults"),
    ApprovalRequest.find({ kind: "delete-pack", state: "pending" }).select("targetId").lean<{ targetId: unknown }[]>(),
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
  const rowFor = (id?: string) => (id && mongoose.isValidObjectId(id) ? rows.find((row) => String(row.variant._id) === id) : undefined);
  // one dialog for the pack being changed (?adjust= is the address older links use), not one per row
  const changing = rowFor(params.pack ?? params.adjust);
  // the pack whose alert is being set opens above the table, one at a time
  const alerting = rowFor(params.alert);
  const filters = new URLSearchParams(
    Object.entries({ q: params.q, stock: params.stock }).filter(([, value]) => value) as [string, string][],
  );
  const closeHref = `/admin/inventory${filters.size ? `?${filters}` : ""}`;
  const withParams = (extra: Record<string, string>) => `/admin/inventory?${new URLSearchParams({ ...Object.fromEntries(filters), ...extra })}`;
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
      {changing && (
        <StockChangeDialog
          key={`${changing.variant._id}-${params.mode}`}
          variantId={String(changing.variant._id)}
          name={`${changing.product?.name.en ?? "Pack"} · ${changing.variant.label}`}
          mode={params.mode === "remove" ? "remove" : "add"}
          onHand={changing.onHand}
          reserved={changing.reserved}
          owner={isOwner}
          closeHref={closeHref}
        />
      )}
      {alerting && (
        <div className="panel adjust-panel" id="alert">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Stock alert</span>
              <h2>
                {alerting.product?.name.en} · {alerting.variant.label}
              </h2>
            </div>
            <Link href={closeHref} className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={catalogManagementAction} submit="Save alert">
            <input type="hidden" name="operation" value="alert" />
            <input type="hidden" name="variantId" value={String(alerting.variant._id)} />
            <label>
              Warn me when fewer than this can be sold{" "}
              <small>0 turns the warning off; blank uses the shop default of {DEFAULT_ALERT_BELOW}</small>
              <input
                name="alertBelow"
                inputMode="numeric"
                pattern="[0-9]{1,6}"
                defaultValue={alerting.ownAlert ?? ""}
                placeholder={String(DEFAULT_ALERT_BELOW)}
                autoComplete="off"
              />
            </label>
          </ActionForm>
        </div>
      )}
      <details className="panel create-staff" id="stock-sheet" open={params.sheet === "1"}>
        <summary>Update stock from a spreadsheet</summary>
        <StockImport owner={isOwner} />
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
            <PackFields owner={isOwner} orderLimit={starts.packOrderLimit} />
          </div>
        </ActionForm>
      </details>
      <FilterBar label="Filter stock" submitLabel="Show stock" clearHref={filtered ? "/admin/inventory" : undefined}>
        <label>
          Search <small>product or pack</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label className="filter-keep">
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
        className="stock-table"
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
                    {variant.label}
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
            cell: ({ variant, product, onHand, reserved, available }) => {
              const id = String(variant._id);
              const name = `${product?.name.en ?? "pack"} ${variant.label}`;
              return (
                <span className="row-actions stock-actions">
                  {available > 0 && (
                    <Link
                      href={withParams({ pack: id, mode: "remove" })}
                      scroll={false}
                      className="secondary-button compact-button"
                      aria-label={`Remove stock of ${name}`}
                    >
                      <Minus size={16} aria-hidden="true" /> Remove
                    </Link>
                  )}
                  <Link
                    href={withParams({ pack: id, mode: "add" })}
                    scroll={false}
                    className="primary-button compact-button"
                    aria-label={`Add stock of ${name}`}
                  >
                    <Plus size={16} aria-hidden="true" /> Add
                  </Link>
                  <Popover className="overflow-menu" label={`More for ${name}`} summary={<MoreVertical size={18} aria-hidden="true" />}>
                    <Link href={`${withParams({ alert: id })}#alert`} className="stock-menu-link">
                      Stock alert
                    </Link>
                    {product && (
                      <Link href={`/admin/products/${product._id}`} className="stock-menu-link">
                        Edit product
                      </Link>
                    )}
                    <DeleteRow
                      target="pack"
                      id={id}
                      owner={isOwner}
                      held={reserved}
                      waiting={waitingDeletes.some((request) => String(request.targetId) === id)}
                      onHand={onHand}
                    />
                  </Popover>
                </span>
              );
            },
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
              // a deleted pack or product keeps its name, so its history still says what it was
              const variant = movement.variantId as unknown as { label?: string; productId?: { name?: { en?: string } } };
              return [variant?.productId?.name?.en, variant?.label].filter(Boolean).join(" · ");
            },
          },
          { header: "What", cell: (movement) => displayStatus(movement.kind) },
          {
            header: "Change",
            numeric: true,
            cell: (movement) => {
              // sales and holds are kept as positive numbers; they take stock away
              const change =
                movement.kind === "sale" || movement.kind === "reserve"
                  ? -Math.abs(movement.quantity)
                  : movement.kind === "release"
                    ? Math.abs(movement.quantity)
                    : movement.quantity;
              return `${change > 0 ? "+" : ""}${change}`;
            },
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
