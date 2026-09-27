import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Category, InventoryItem, Product, ProductVariant } from "@/lib/db/models";
import { objectId } from "@/lib/commerce/service";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { governanceAction } from "@/lib/governance/actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { ActionForm } from "@/components/action-form";
import { MoneyInput } from "@/components/money-input";
import { PageHeading } from "@/components/page-heading";
import { RecordHistory } from "@/components/record-history";
import { StatusPill } from "@/components/status-pill";
import { AisleIcon } from "@/components/aisle-icon";
export const metadata = { title: "Edit product", robots: { index: false } };

const STATUS_NAMES: Record<string, string> = {
  published: "Live in the shop",
  pending: "Waiting for approval",
  approved: "Approved, not live",
  draft: "Draft",
  rejected: "Rejected",
};

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("catalog:write");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const product = await Product.findById(id);
  if (!product) notFound();
  const [categories, packs] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    ProductVariant.find({ productId: product._id }).sort({ sku: 1 }),
  ]);
  const stock = await InventoryItem.find({ variantId: { $in: packs.map((pack) => pack._id) } });
  const image = product.image ?? productImages[product.slug];
  const category = categories.find((item) => String(item._id) === String(product.categoryId));
  const live = product.status === "published";
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/products">Products</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{product.name.en}</span>
      </nav>
      <PageHeading
        eyebrow={category?.name.en ?? product.categorySlug}
        title={product.name.en}
        lead={<StatusPill value={product.status}>{STATUS_NAMES[product.status] ?? product.status}</StatusPill>}
        aside={
          live ? (
            <Link href={`/products/${product.slug}`} className="secondary-button" target="_blank">
              View in the shop <ExternalLink size={16} aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      <div className="editor-layout">
        <ActionForm action={catalogManagementAction} submit="Save product details" className="form-stack panel">
          <input type="hidden" name="operation" value="product" />
          <input type="hidden" name="productId" value={id} />
          <fieldset className="form-section">
            <legend>Name and description</legend>
            <div className="staff-form-grid">
              <label>
                English name
                <input name="nameEn" defaultValue={product.name.en} required />
              </label>
              <label>
                Marathi name
                <input name="nameMr" defaultValue={product.name.mr} required lang="mr" />
              </label>
            </div>
            <label>
              English description
              <textarea name="descriptionEn" defaultValue={product.description.en} required />
            </label>
            <label>
              Marathi description
              <textarea name="descriptionMr" defaultValue={product.description.mr} required lang="mr" />
            </label>
          </fieldset>
          <fieldset className="form-section">
            <legend>How shoppers find it</legend>
            <div className="staff-form-grid">
              <label>
                Aisle
                <select name="categoryId" defaultValue={String(product.categoryId)}>
                  {categories.map((item) => (
                    <option value={String(item._id)} key={String(item._id)}>
                      {item.name.en}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Brand
                <input name="brand" defaultValue={product.brand} />
              </label>
            </div>
            <label>
              Other words shoppers type <small>Separated by commas, English or Marathi</small>
              <input name="aliases" defaultValue={product.aliases.join(", ")} />
            </label>
          </fieldset>
          <fieldset className="form-section">
            <legend>Extra details</legend>
            <div className="staff-form-grid">
              <label>
                English highlights <small>One per line</small>
                <textarea
                  name="highlightsEn"
                  defaultValue={(product.highlights ?? []).map((item: { en: string }) => item.en).join("\n")}
                />
              </label>
              <label>
                Marathi highlights <small>One per line</small>
                <textarea
                  name="highlightsMr"
                  lang="mr"
                  defaultValue={(product.highlights ?? []).map((item: { mr: string }) => item.mr).join("\n")}
                />
              </label>
            </div>
            <label>
              Specifications <small>One per line: label EN | label MR | value EN | value MR</small>
              <textarea
                name="specifications"
                defaultValue={(product.specifications ?? [])
                  .map(
                    (item: { label: { en: string; mr: string }; value: { en: string; mr: string } }) =>
                      `${item.label.en} | ${item.label.mr} | ${item.value.en} | ${item.value.mr}`,
                  )
                  .join("\n")}
              />
            </label>
            <div className="staff-form-grid">
              <label>
                Tags <small>Separated by commas</small>
                <input name="dietaryTags" defaultValue={(product.dietaryTags ?? []).join(", ")} />
              </label>
              <label>
                More photo links <small>One per line, up to 8</small>
                <textarea name="images" defaultValue={(product.images ?? []).join("\n")} />
              </label>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Where it shows</legend>
            <label className="checkbox-label">
              <input type="checkbox" name="featured" defaultChecked={product.featured} /> Feature on the home page
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="bestseller" defaultChecked={product.bestseller} /> Mark as popular
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="published" defaultChecked={live} disabled={!live} /> Live in the shop
              {!live && <small>New products go live once an owner approves them.</small>}
            </label>
          </fieldset>
        </ActionForm>
        <aside className="editor-side">
          <div className="panel">
            <h2>Photo</h2>
            <span className={`product-art editor-photo${image ? "" : " quiet"}`}>
              {image ? (
                <Image src={image} alt={`Current photo of ${product.name.en}`} fill sizes="320px" unoptimized />
              ) : (
                <AisleIcon slug={product.categorySlug} />
              )}
            </span>
            <ActionForm action={evidenceAction} submit="Upload new photo">
              <input type="hidden" name="purpose" value="product" />
              <input type="hidden" name="productId" value={id} />
              <label>
                Photo <small>JPG, PNG or WebP, up to 5 MB</small>
                <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
              </label>
            </ActionForm>
          </div>
          <div className="panel">
            <h2>Packs and prices</h2>
            {packs.length ? (
              <ul className="pack-list">
                {packs.map((pack) => {
                  const item = stock.find((row) => String(row.variantId) === String(pack._id));
                  const left = Math.max(0, (item?.onHand ?? 0) - (item?.reserved ?? 0));
                  return (
                    <li key={String(pack._id)}>
                      <div className="pack-row">
                        <span>
                          <strong>{pack.label}</strong>
                          <small>SKU {pack.sku}</small>
                        </span>
                        <span className="pack-price">
                          {formatPrice(pack.pricePaise)}
                          {pack.mrpPaise > pack.pricePaise && <del>{formatPrice(pack.mrpPaise)}</del>}
                        </span>
                      </div>
                      <p className="pack-stock">
                        {left === 0 ? (
                          <StatusPill tone="bad">Sold out</StatusPill>
                        ) : left <= 10 ? (
                          <StatusPill tone="warn">{left} left</StatusPill>
                        ) : (
                          <span>{left} in stock</span>
                        )}
                        <Link href={`/admin/inventory?adjust=${pack._id}#adjust`}>Adjust stock</Link>
                      </p>
                      <details>
                        <summary>Change the price</summary>
                        <ActionForm action={governanceAction} submit="Send for approval">
                          <input type="hidden" name="operation" value="price" />
                          <input type="hidden" name="variantId" value={String(pack._id)} />
                          <label>
                            Selling price (₹)
                            <MoneyInput name="priceRupees" defaultValue={pack.pricePaise / 100} />
                          </label>
                          <label>
                            MRP (₹)
                            <MoneyInput name="mrpRupees" defaultValue={pack.mrpPaise / 100} />
                          </label>
                          <p className="muted">A second owner approves price changes before shoppers see them.</p>
                        </ActionForm>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No pack yet, so shoppers cannot buy this product.</p>
            )}
            <Link href={`/admin/inventory?new=pack&product=${id}#new-pack`} className="text-button">
              Add another pack size
            </Link>
          </div>
        </aside>
      </div>
      <RecordHistory target={id} title="Product history" />
    </section>
  );
}
