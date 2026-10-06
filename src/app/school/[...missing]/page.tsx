import { notFound } from "next/navigation";

/** Any other address under /school: "not found" inside the school marketplace's own header. */
export default function MissingSchoolPage() {
  notFound();
}
