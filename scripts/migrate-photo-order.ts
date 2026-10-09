// One-time, safe to run again: before 7 October 2026 a new upload became a product's cover but went
// to the end of its photo list, so the shop showed different "first photos" in different places.
// Now the list is the order and the cover is its first photo; this puts each cover first.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Product } from "../src/lib/db/models";
import { orderedPhotos, photoFields } from "../src/lib/catalog/photos";

export async function orderProductPhotos() {
  await connectDB();
  const products = await Product.find({ image: { $exists: true, $nin: [null, ""] } }).select("image images");
  let changed = 0;
  for (const product of products) {
    const ordered = orderedPhotos(product);
    const current = (product.images ?? []) as string[];
    if (current.length === ordered.length && current.every((url, index) => url === ordered[index])) continue;
    await Product.updateOne({ _id: product._id }, { $set: photoFields(ordered) });
    changed += 1;
  }
  return changed;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-photo-order.ts")) {
  const changed = await orderProductPhotos();
  console.log(`Database "${mongoose.connection.name}": ${changed} product(s) now show their cover first.`);
  await mongoose.disconnect();
}
