import Image from "next/image";
import { FIELD_LABELS as labels } from "@/lib/governance/labels";

/** Values shown in words rather than as stored. */
const VALUE_WORDS: Record<string, Record<string, string>> = {
  registration: { regular: "Regular", composition: "Composition", unregistered: "Not registered" },
  style: {
    same: "Same as Agarwal's bills",
    modern: "Modern",
    ledger: "Parchment ledger",
    bilingual: "Marathi and English",
    shree: "Shree festive",
  },
};
/** Keys the reviewer doesn't need to read (the product is already named in the title). */
// a pack's SKU is made for it and only the stock sheet uses it
const HIDDEN = new Set(["productId", "sku"]);
export function ApprovalDetails({
  values,
  categoryName,
  providerName,
}: {
  values?: Record<string, unknown>;
  categoryName?: string;
  /** "Sharma Stationers, Roha", shown instead of the provider's id. */
  providerName?: string;
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
            {key === "images" && Array.isArray(value)
              ? value.length
                ? (
                    <span className="approval-photos">
                      {value.map((url, index) => (
                        <Image key={String(url)} src={String(url)} alt={`Photo ${index + 1}`} width={64} height={64} />
                      ))}
                    </span>
                  )
                : "None"
              : key === "categoryId" && categoryName
              ? categoryName
              : key === "providerId" && providerName
              ? providerName
              : typeof value === "string" && VALUE_WORDS[key]?.[value]
              ? VALUE_WORDS[key][value]
              : key.endsWith("Paise") && typeof value === "number"
                ? new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                  }).format(value / 100)
                : typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
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
