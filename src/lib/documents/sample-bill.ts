import { connectDB } from "../db/connect";
import { Product, ProductVariant } from "../db/models";
import { taxProfile } from "../tax/profile";
import { GST_STATES } from "../tax/gst";
import { istDate } from "../commerce/delivery";
import { BILL_STYLES, shopSettings } from "../settings/shop";
import { getEnv } from "../env";
import { renderInvoice, type InvoiceLine } from "./invoice";
import { lineFacts } from "./line-facts";

/** One sample to draw: a bill style to try (else the saved one), the kaccha bill, or a small thumbnail. */
export type SampleBill = { style?: string; estimate?: boolean; thumb?: boolean };

/**
 * Bills for a made-up order of three products from the shelves, with the bill settings saved now:
 * Customize → Bills' previews and its row of style thumbnails. The order is read once for them all.
 * Nothing is stored.
 */
export async function sampleBills(samples: SampleBill[]) {
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
  // fresh: a style just picked shows at once, not after the shop cache's minute
  const [shop, saved, facts, pay] = await Promise.all([taxProfile(), shopSettings("bill", true), lineFacts(items), shopSettings("quotation")]);
  const subtotal = items.reduce((sum, item) => sum + item.linePaise, 0);
  const now = new Date();
  const day = istDate(now).replaceAll("-", "");
  const state = GST_STATES.find((entry) => entry.code === shop.stateCode);
  return samples.map(({ style, estimate = false, thumb = false }) => {
    const tryStyle = BILL_STYLES.find((option) => option.value === style)?.value;
    // a thumbnail has no print button or notes over it
    const bill = { ...saved, ...(tryStyle ? { style: tryStyle } : {}), ...(thumb ? { openAs: "download" } : {}) };
    return renderInvoice({
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
      number: estimate ? `EST-SAMPLE-${day}-00001` : `${day}-00001`,
      date: now,
      bill,
      facts,
      origin: getEnv().APP_ORIGIN,
      sample: !thumb,
      estimate,
      staffView: !thumb,
      payment: { accountName: pay.accountName, bankName: pay.bankName, accountNumber: pay.accountNumber, ifsc: pay.ifsc, upiId: pay.upiId },
    });
  });
}
