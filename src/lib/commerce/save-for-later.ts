import { connectDB } from "../db/connect";
import { ProductVariant } from "../db/models";
import { ensureSaved } from "../engagement/service";
import { CartLine } from "./models";
import { objectId } from "./service";

/**
 * "Save for later": the product goes to the shopper's Wishlist and the line leaves the basket.
 * It's saved first, so a failure never loses the item from both places.
 */
export async function saveForLater(customerId: string, variantInput: unknown) {
  const variantId = objectId.parse(variantInput);
  await connectDB();
  if (!(await CartLine.exists({ customerId, variantId }))) throw Error("This item is no longer in your basket.");
  const variant = await ProductVariant.findById(variantId).select("productId");
  if (!variant) throw Error("This item is no longer sold.");
  await ensureSaved(customerId, String(variant.productId));
  await CartLine.deleteOne({ customerId, variantId });
}
