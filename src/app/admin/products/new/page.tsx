import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { requirePage } from "@/lib/auth/session";
import { governanceAction } from "@/lib/governance/actions";
import { Category, parentsOf } from "@/lib/db/models";
import { hasPermission } from "@/lib/auth/permissions";
import { AudienceAndTaxFields, PackFields, ProductDetailsFields } from "@/components/request-fields";
import { ProductPhotos } from "@/components/product-photos";
import { ProviderPicker, type ProviderOption } from "@/components/provider-picker";
import { Provider } from "@/lib/providers/models";
export const metadata = { title: "Add a product", robots: { index: false } };

export default async function NewProductPage() {
  const user = await requirePage("catalog:write");
  // only an owner prices for schools
  const isOwner = hasPermission(user.roles, "settings:write");
  const [categories, providers] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Provider.find({ status: { $in: ["active", "pending"] } }).sort({ name: 1 }).select("name town status").lean<
      { _id: unknown; name: string; town: string; status: ProviderOption["status"] }[]
    >(),
  ]);
  // products sit on shelves; a section only groups them
  const sectionIds = new Set(categories.flatMap((item) => parentsOf(item)));
  const shelves = categories.filter((item) => !sectionIds.has(String(item._id)));
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/products">Products</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Add a product</span>
      </nav>
      <PageHeading
        eyebrow="Run the store"
        title="Add a product"
        lead={
          isOwner
            ? "Describe the product, add its photos and its first pack. It goes live as soon as you add it."
            : "Describe the product, add its photos and its first pack. It goes live once an owner approves it."
        }
      />
      <ActionForm action={governanceAction} submit={isOwner ? "Add product" : "Send for approval"} className="form-stack panel editor-panel">
        <input type="hidden" name="operation" value="product" />
        <ProductDetailsFields shelves={shelves.map((item) => ({ id: String(item._id), name: item.name.en }))}>
          <ProviderPicker
            owner={isOwner}
            providers={providers.map((p) => ({ id: String(p._id), name: p.name, town: p.town, status: p.status }))}
          />
        </ProductDetailsFields>
        <fieldset className="form-section" id="photos">
          <legend>
            Photos <small>Optional · the first is the cover</small>
          </legend>
          <ProductPhotos mode="draft" initial={[]} name="the new product" />
        </fieldset>
        <fieldset className="form-section">
          <legend>First pack</legend>
          <div className="staff-form-grid">
            <PackFields owner={isOwner} />
          </div>
        </fieldset>
        <AudienceAndTaxFields />
      </ActionForm>
    </section>
  );
}
