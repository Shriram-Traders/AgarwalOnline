import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { connectDB } from "@/lib/db/connect";
import { Product, ProductVariant } from "@/lib/db/models";
import { taxProfile } from "@/lib/tax/profile";
import { GST_STATES } from "@/lib/tax/gst";
import { istDate } from "@/lib/commerce/delivery";
import { shopSettings } from "@/lib/settings/shop";
import { renderInvoice, type InvoiceLine } from "@/lib/documents/invoice";
import { lineFacts } from "@/lib/documents/line-facts";
import { getEnv } from "@/lib/env";

/**
 * Customize → Bills' preview: a made-up order of three products from the shelves, billed with the
 * settings saved now. Owners only; nothing is stored.
 */
export async function GET() {
  const user = await currentUser();
  if (!user || !hasPermission(user.roles, "settings:write")) return new Response("Owners only", { status: 403 });
  await connectDB();
  const products = await Product.find({ status: "published" })
    .sort({ createdAt: 1 })
    .limit(3)
    .select("name")
    .lean<{ _id: unknown; name: { en: string } }[]>();
  const packs = await ProductVariant.find({ productId: { $in: products.map((product) => product._id) }, active: true })
    .select("productId label pricePaise")
    .lean<{ _id: unknown; productId: unknown; label: string; pricePaise: number }[]>();
  const items: InvoiceLine[] = products.flatMap((product, index) => {
    const pack = packs.find((candidate) => String(candidate.productId) === String(product._id));
    if (!pack) return [];
    const quantity = index === 0 ? 2 : 1;
    return [{ variantId: pack._id, name: product.name.en, label: pack.label, quantity, pricePaise: pack.pricePaise, linePaise: pack.pricePaise * quantity }];
  });
  const [shop, bill, facts] = await Promise.all([taxProfile(), shopSettings("bill"), lineFacts(items)]);
  const subtotal = items.reduce((sum, item) => sum + item.linePaise, 0);
  const now = new Date();
  const day = istDate(now).replaceAll("-", "");
  const state = GST_STATES.find((entry) => entry.code === shop.stateCode);
  const html = renderInvoice({
    order: {
      number: `SAMPLE-${day}-00001`,
      createdAt: now,
      items,
      address: { name: "Sample customer", phone: "9876543210", line: "Main Road", areaName: "Nagothane", pin: "402106" },
      deliveryDate: istDate(now),
      paymentMethod: "cod",
      paymentStatus: "pending",
      orderStatus: "confirmed",
      subtotalPaise: subtotal,
      merchandiseSavingsPaise: 0,
      deliveryPaise: 3000,
      totalPaise: subtotal + 3000,
    },
    seller: { legalName: shop.legalName, address: shop.address, phone: shop.phone, gstin: shop.gstin, email: shop.email },
    stateName: state ? `${state.name} (${state.code})` : shop.stateCode,
    number: `${day}-00001`,
    date: now,
    bill,
    facts,
    origin: getEnv().APP_ORIGIN,
    sample: true,
    staffView: true,
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
