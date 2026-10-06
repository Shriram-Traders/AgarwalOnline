import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { chosenSchool } from "@/lib/schools/current";
import { schoolContext } from "@/lib/schools/membership";
import { catalogForSchools } from "@/lib/catalog/queries";
import { quoteMoney } from "@/lib/schools/display";

export const runtime = "nodejs";

/** Live suggestions for the school marketplace's search: representatives of an active school only. */
export async function GET(request: NextRequest) {
  try {
    const query = z.string().trim().min(2).max(60).parse(request.nextUrl.searchParams.get("q"));
    const user = await currentUser();
    if (!user) return Response.json([], { status: 401 });
    const { current } = await schoolContext(user.id, undefined, await chosenSchool());
    if (!current?.active) return Response.json([], { status: 403 });
    await rateLimit(`school-suggest:${user.id}`, 60, 60_000);
    const products = await catalogForSchools({ q: query });
    return Response.json(
      products.slice(0, 8).map((product) => {
        const price = product.variants[0]?.schoolPricePaise;
        return {
          slug: product.slug,
          name: product.name,
          brand: product.brand,
          pricePaise: price ?? 0,
          priceText: price != null ? `${quoteMoney(price)} + GST` : "On quotation",
        };
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json([], { status: 200 });
  }
}
