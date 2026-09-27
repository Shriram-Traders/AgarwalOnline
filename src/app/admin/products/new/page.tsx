import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { governanceAction } from "@/lib/governance/actions";
import { Category } from "@/lib/db/models";
import { MoneyInput } from "@/components/money-input";
export const metadata = { title: "Add a product", robots: { index: false } };

export default async function NewProductPage() {
  await requirePage("catalog:write");
  const categories = await Category.find({}).sort({ "name.en": 1 });
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/products">Products</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Add a product</span>
      </nav>
      <PageHeading
        eyebrow="Catalog"
        title="Add a product"
        lead="Describe the product and its first pack. It goes live once an owner approves it."
      />
      <ActionForm action={governanceAction} submit="Send for approval" className="form-stack panel editor-panel">
        <input type="hidden" name="operation" value="product" />
        <fieldset className="form-section">
          <legend>Name and description</legend>
          <div className="staff-form-grid">
            <label>
              English name
              <input name="nameEn" required />
            </label>
            <label>
              Marathi name
              <input name="nameMr" lang="mr" required />
            </label>
          </div>
          <label>
            English description
            <textarea name="descriptionEn" required />
          </label>
          <label>
            Marathi description
            <textarea name="descriptionMr" lang="mr" required />
          </label>
        </fieldset>
        <fieldset className="form-section">
          <legend>How shoppers find it</legend>
          <div className="staff-form-grid">
            <label>
              Aisle
              <select name="categoryId" required>
                {categories.map((item) => (
                  <option value={String(item._id)} key={String(item._id)}>
                    {item.name.en}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Brand <small>Optional</small>
              <input name="brand" />
            </label>
            <label>
              Web address <small>Lowercase words joined by dashes, like gel-pen-set</small>
              <input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" spellCheck={false} required />
            </label>
            <label>
              Other words shoppers type <small>Separated by commas, like notebook, diary, वही</small>
              <input name="aliases" />
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <legend>First pack</legend>
          <div className="staff-form-grid">
            <label>
              Pack label <small>What shoppers see, like “Pack of 10”</small>
              <input name="label" required />
            </label>
            <label>
              SKU <small>Letters, numbers and dashes</small>
              <input name="sku" pattern="[A-Za-z0-9-]+" spellCheck={false} required />
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
              Selling price (₹)
              <MoneyInput name="priceRupees" />
            </label>
            <label>
              MRP (₹) <small>The printed price; the saving is worked out from it</small>
              <MoneyInput name="mrpRupees" />
            </label>
            <label>
              Opening stock
              <input name="stock" inputMode="numeric" pattern="[0-9]+" required />
            </label>
          </div>
        </fieldset>
      </ActionForm>
    </section>
  );
}
