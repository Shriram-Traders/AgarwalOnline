import Link from "next/link";
import mongoose from "mongoose";
import { FolderTree } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { requirePage } from "@/lib/auth/session";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { Category, Product } from "@/lib/db/models";
export const metadata = { title: "Categories", robots: { index: false } };

type CategoryDoc = { _id: unknown; slug: string; name: { en: string; mr: string }; symbol?: string; parentId?: unknown };

/** The same five fields for adding and editing, so the two forms can never drift apart. */
function CategoryFields({ category, all }: { category?: CategoryDoc; all: CategoryDoc[] }) {
  return (
    <div className="staff-form-grid">
      <label>
        English name
        <input name="nameEn" defaultValue={category?.name.en} required />
      </label>
      <label>
        Marathi name
        <input name="nameMr" defaultValue={category?.name.mr} lang="mr" required />
      </label>
      <label>
        Web address <small>Lowercase words joined by dashes, like gift-wrap</small>
        <input
          name="slug"
          defaultValue={category?.slug}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          spellCheck={false}
          required
        />
      </label>
      <label>
        Inside another aisle
        <select name="parentId" defaultValue={String(category?.parentId ?? "")}>
          <option value="">No, a top-level aisle</option>
          {all
            .filter((item) => String(item._id) !== String(category?._id))
            .map((item) => (
              <option value={String(item._id)} key={String(item._id)}>
                {item.name.en}
              </option>
            ))}
        </select>
      </label>
      <label>
        Short symbol <small>Optional, one character</small>
        <input name="symbol" defaultValue={category?.symbol} maxLength={12} />
      </label>
    </div>
  );
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requirePage("catalog:write");
  const { edit } = await searchParams;
  const [categories, counts] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Product.aggregate<{ _id: unknown; count: number }>([{ $group: { _id: "$categoryId", count: { $sum: 1 } } }]),
  ]);
  const countFor = (id: unknown) => counts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const editing = edit && mongoose.isValidObjectId(edit) ? categories.find((item) => String(item._id) === edit) : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Categories"
        lead="The aisles shoppers browse. Every aisle needs an English and a Marathi name."
      />
      <CatalogAdminNav />
      {editing && (
        <div className="panel adjust-panel" id="edit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Edit aisle</span>
              <h2>{editing.name.en}</h2>
            </div>
            <Link href="/admin/categories" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={catalogManagementAction} submit="Save aisle">
            <input type="hidden" name="operation" value="category" />
            <input type="hidden" name="categoryId" value={String(editing._id)} />
            <CategoryFields category={editing} all={categories} />
          </ActionForm>
        </div>
      )}
      <details className="panel create-staff">
        <summary>Add an aisle</summary>
        <ActionForm action={catalogManagementAction} submit="Add aisle">
          <input type="hidden" name="operation" value="category" />
          <CategoryFields all={categories} />
        </ActionForm>
      </details>
      <DataTable
        caption="Aisles with their Marathi name, web address and number of products"
        rows={categories}
        rowKey={(category) => String(category._id)}
        columns={[
          {
            header: "Aisle",
            cell: (category) => (
              <span className="product-cell">
                <span>
                  <strong>{category.name.en}</strong>
                  <small lang="mr">{category.name.mr}</small>
                </span>
              </span>
            ),
          },
          { header: "Web address", cell: (category) => <code>/catalog?category={category.slug}</code> },
          {
            header: "Inside",
            cell: (category) =>
              categories.find((item) => String(item._id) === String(category.parentId))?.name.en ?? "—",
          },
          { header: "Products", numeric: true, cell: (category) => countFor(category._id) },
          {
            header: "Action",
            cell: (category) => (
              <Link href={`/admin/categories?edit=${category._id}#edit`} aria-label={`Edit ${category.name.en}`}>
                Edit
              </Link>
            ),
          },
        ]}
        empty={
          <EmptyState icon={FolderTree} title="No aisles yet" body="Add the first aisle above so products have somewhere to live." heading="h3" />
        }
      />
    </section>
  );
}
