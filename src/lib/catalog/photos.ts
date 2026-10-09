import { z } from "zod";

/**
 * A product's photos are one ordered list (`images`); the first is the cover that cards, search,
 * the basket and the shop's first picture use. `image` is kept equal to that first photo, so code
 * that reads the cover shows the right one. Pure, so pages, services and tests share it.
 */
export const MAX_PHOTOS = 10;

/** Where a product photo may come from: the shop's own uploads, or a photo address on the web. */
export const photoUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^\/api\/evidence\/[a-f\d]{24}$/i.test(value) || /^https:\/\/[^\s"'<>]+$/i.test(value), {
    message: "Use an uploaded photo or an https:// photo link.",
  });

/** Up to ten photo addresses, in order, each once. */
export const photoList = z
  .array(photoUrl)
  .max(MAX_PHOTOS, { message: `A product can have up to ${MAX_PHOTOS} photos.` })
  .transform((list) => [...new Set(list)]);

/**
 * A product's photos in the order shoppers see them: the cover first, then the rest, each once.
 * Products saved before photos had an order kept the newest upload as the cover and listed it
 * last, so the cover wins over the list's own first entry.
 */
export function orderedPhotos(product: { image?: string | null; images?: readonly string[] | null }): string[] {
  const list = (product.images ?? []).filter(Boolean);
  const cover = product.image || undefined;
  return cover ? [cover, ...list.filter((url) => url !== cover)] : [...new Set(list)];
}

/** The two fields to save for an ordered list: the list itself, and the cover kept in step. */
export function photoFields(images: readonly string[]) {
  return images.length ? { images: [...images], image: images[0] } : { images: [] as string[], image: undefined };
}
