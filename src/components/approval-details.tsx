const labels: Record<string, string> = {
  slug: "Web address",
  nameEn: "English name",
  nameMr: "Marathi name",
  descriptionEn: "English description",
  descriptionMr: "Marathi description",
  brand: "Brand",
  categoryId: "Category",
  aliases: "Search terms",
  sku: "SKU",
  label: "Pack",
  unit: "Unit",
  packQuantity: "Pack quantity",
  pricePaise: "Selling price",
  mrpPaise: "MRP",
  stock: "Opening stock",
  onHand: "Stock on hand",
  delta: "Stock adjustment",
  maxQuantity: "Most one shopper can buy",
};
/** Keys the reviewer doesn't need to read (the product is already named in the title). */
const HIDDEN = new Set(["productId"]);
export function ApprovalDetails({
  values,
  categoryName,
}: {
  values?: Record<string, unknown>;
  categoryName?: string;
}) {
  if (!values)
    return <p className="muted">New — nothing is live yet.</p>;
  return (
    <dl className="approval-details">
      {Object.entries(values)
        .filter(([key]) => !HIDDEN.has(key))
        .map(([key, value]) => (
        <div key={key}>
          <dt>{labels[key] ?? key}</dt>
          <dd>
            {key === "categoryId" && categoryName
              ? categoryName
              : key.endsWith("Paise") && typeof value === "number"
                ? new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                  }).format(value / 100)
                : // 0 is a real value (no stock); only a missing one is a dash
                  value === undefined || value === null || value === ""
                  ? "—"
                  : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
