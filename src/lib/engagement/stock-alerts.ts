import mongoose from "mongoose";
import { InventoryItem, Product, ProductVariant } from "@/lib/db/models";
import { shopperVisible } from "@/lib/catalog/visibility";
import { log } from "@/lib/logger";
import { StockAlert } from "./models";
import { notify } from "./service";

/*
 * "Tell me when it's back": a shopper asks on a sold-out pack's page, and gets one notification (the
 * bell, and their phone if they turned that on) once it can be bought again. Stock comes back many ways
 * (a stock change, an approved request, a cancelled order, an import), so instead of each one telling
 * this, sendBackInStock looks at every waiting alert: right after a stock change in the admin, and every
 * hour from the cron for the rest.
 */

const LAPSE_DAYS = 90;

/** The packs this shopper is waiting for, among these. */
export async function waitingFor(userId: string | undefined, variantIds: string[]) {
  if (!userId || !variantIds.length) return new Set<string>();
  const alerts = await StockAlert.find({ userId, variantId: { $in: variantIds } }).select("variantId").lean<{ variantId: unknown }[]>();
  return new Set(alerts.map((alert) => String(alert.variantId)));
}

/** Turns the alert on or off for one pack. On is only for a pack shoppers can see. */
export async function setStockAlert(userId: string, variantIdInput: unknown, want: boolean) {
  const variantId = String(variantIdInput ?? "");
  if (!mongoose.isValidObjectId(variantId)) throw new Error("This product is unavailable.");
  if (!want) {
    await StockAlert.deleteOne({ userId, variantId });
    return false;
  }
  const variant = await ProductVariant.findOne({ _id: variantId, active: { $ne: false } }).select("productId").lean<{ productId: unknown }>();
  if (!variant || !(await Product.exists({ _id: variant.productId, ...shopperVisible }))) throw new Error("This product is unavailable.");
  await StockAlert.updateOne(
    { userId, variantId },
    { $set: { productId: variant.productId, expiresAt: new Date(Date.now() + LAPSE_DAYS * 86400_000) } },
    { upsert: true },
  );
  return true;
}

type Alert = { _id: unknown; userId: unknown; variantId: unknown };

/** Tells everyone whose pack can be bought again, once each. */
export async function sendBackInStock() {
  const alerts = await StockAlert.find().select("userId variantId").lean<Alert[]>();
  if (!alerts.length) return { sent: 0 };
  const ids = [...new Set(alerts.map((alert) => String(alert.variantId)))];
  const [stock, variants] = await Promise.all([
    InventoryItem.find({ variantId: { $in: ids } }).select("variantId onHand reserved").lean<{ variantId: unknown; onHand: number; reserved: number }[]>(),
    ProductVariant.find({ _id: { $in: ids }, active: { $ne: false } }).select("productId label").lean<{ _id: unknown; productId: unknown; label: string }[]>(),
  ]);
  const inStock = new Set(stock.filter((item) => item.onHand - item.reserved > 0).map((item) => String(item.variantId)));
  const back = variants.filter((variant) => inStock.has(String(variant._id)));
  if (!back.length) return { sent: 0 };
  const products = await Product.find({ _id: { $in: back.map((variant) => variant.productId) }, ...shopperVisible })
    .select("slug name")
    .lean<{ _id: unknown; slug: string; name: { en: string } }[]>();
  const productOf = new Map(products.map((product) => [String(product._id), product]));
  let sent = 0;
  for (const variant of back) {
    const product = productOf.get(String(variant.productId));
    if (!product) continue;
    for (const alert of alerts.filter((each) => String(each.variantId) === String(variant._id))) {
      // taken off the list first, so two runs at once never send it twice
      if (!(await StockAlert.deleteOne({ _id: alert._id })).deletedCount) continue;
      try {
        await notify({
          userId: alert.userId,
          type: "stock",
          title: `Back in stock: ${product.name.en}`,
          body: `${variant.label} is back. Add it before it runs out again.`,
          href: `/products/${product.slug}`,
        });
        sent += 1;
      } catch (error) {
        log("warn", "stock-alert.failed", { error, variantId: String(variant._id) });
      }
    }
  }
  return { sent };
}
