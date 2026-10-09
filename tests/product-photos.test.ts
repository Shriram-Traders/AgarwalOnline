import { describe, expect, it } from "vitest";
import { MAX_PHOTOS, orderedPhotos, photoFields, photoList, photoUrl } from "../src/lib/catalog/photos";

const id = (n: number) => `/api/evidence/${String(n).padStart(24, "0")}`;

describe("product photo order", () => {
  it("puts the cover first, each photo once", () => {
    // saved the old way: the newest upload was the cover and went to the end of the list
    expect(orderedPhotos({ image: id(3), images: [id(1), id(2), id(3)] })).toEqual([id(3), id(1), id(2)]);
    // saved the new way: the list is the order and the cover is already first
    expect(orderedPhotos({ image: id(1), images: [id(1), id(2)] })).toEqual([id(1), id(2)]);
    // a cover that was never in the list still leads
    expect(orderedPhotos({ image: "https://example.com/a.jpg", images: [id(1)] })).toEqual(["https://example.com/a.jpg", id(1)]);
    expect(orderedPhotos({ images: [id(1), id(1), id(2)] })).toEqual([id(1), id(2)]);
    expect(orderedPhotos({})).toEqual([]);
  });

  it("keeps the cover in step with the list it saves", () => {
    expect(photoFields([id(2), id(1)])).toEqual({ images: [id(2), id(1)], image: id(2) });
    expect(photoFields([])).toEqual({ images: [], image: undefined });
  });
});

describe("product photo addresses", () => {
  it("accepts the shop's uploads and https links only", () => {
    for (const ok of [id(7), "https://images.unsplash.com/photo-1?w=700", "https://res.cloudinary.com/x/image/upload/a.jpg"])
      expect(photoUrl.safeParse(ok).success, ok).toBe(true);
    for (const bad of [
      "http://example.com/a.jpg",
      "javascript:alert(1)",
      "/api/evidence/not-an-id",
      "/uploads/a.jpg",
      "https://example.com/a b.jpg",
      'https://example.com/"onerror=',
      "",
    ])
      expect(photoUrl.safeParse(bad).success, bad).toBe(false);
  });

  it("allows up to ten photos and drops repeats", () => {
    const ten = Array.from({ length: MAX_PHOTOS }, (_, n) => id(n + 1));
    expect(photoList.parse(ten)).toHaveLength(10);
    expect(photoList.safeParse([...ten, id(11)]).success).toBe(false);
    expect(photoList.parse([id(1), id(1), id(2)])).toEqual([id(1), id(2)]);
  });
});
