import { redirect } from "next/navigation";
import { withQuery } from "@/lib/schools/paths";

/** The old "quote basket" address, still in emails and notifications: the basket lives at /school/basket now. */
export default async function OldQuoteBasket({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  redirect(withQuery("/school/basket", { s }));
}
