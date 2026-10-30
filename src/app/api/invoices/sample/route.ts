import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sampleBills } from "@/lib/documents/sample-bill";

/**
 * Customize → Bills' preview: a made-up order of three products from the shelves, billed with the
 * settings saved now. `?style=` tries another bill style before saving it; `?kind=estimate` shows the
 * kaccha bill. Owners only; nothing is stored.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !hasPermission(user.roles, "settings:write")) return new Response("Owners only", { status: 403 });
  const query = new URL(request.url).searchParams;
  const [html] = await sampleBills([{ style: query.get("style") ?? undefined, estimate: query.get("kind") === "estimate" }]);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
