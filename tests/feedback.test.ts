import { describe, expect, it } from "vitest";
import { feedbackCopy } from "../src/lib/feedback/copy";
import {
  cleanTags,
  complaintTypeFor,
  FEEDBACK_TAGS,
  feedbackPromptAllowed,
  LIKED_TAGS,
  NEEDS_ATTENTION,
  tagsFor,
  WRONG_TAGS,
} from "../src/lib/feedback/rules";

/** Every key path in an object, so two dictionaries can be compared line for line. */
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, inner]) => paths(inner, prefix ? `${prefix}.${key}` : key));
}

describe("order feedback rules", () => {
  it("asks what was good after 4 or 5 stars and what went wrong after 1 to 3", () => {
    expect(tagsFor(5)).toBe(LIKED_TAGS);
    expect(tagsFor(4)).toBe(LIKED_TAGS);
    for (const stars of [1, 2, 3]) expect(tagsFor(stars)).toBe(WRONG_TAGS);
    expect(new Set(FEEDBACK_TAGS).size).toBe(LIKED_TAGS.length + WRONG_TAGS.length);
  });

  it("keeps only the tags that belong to the rating, each once", () => {
    expect(cleanTags(5, ["on-time", "late", "on-time", "made-up"])).toEqual(["on-time"]);
    expect(cleanTags(2, ["on-time", "late", "item-missing"])).toEqual(["late", "item-missing"]);
    expect(cleanTags(3, [])).toEqual([]);
  });

  it("points an item problem on a low rating at the complaints form", () => {
    expect(complaintTypeFor(1, ["late", "damaged-item"])).toBe("damaged-item");
    expect(complaintTypeFor(3, ["item-missing", "wrong-item"])).toBe("missing-item");
    expect(complaintTypeFor(2, ["late", "rude-partner"])).toBeUndefined();
    // a happy customer isn't sent to complaints, whatever was posted
    expect(complaintTypeFor(5, ["damaged-item"])).toBeUndefined();
  });

  it("only lets the popup open on pages people browse", () => {
    for (const path of ["/", "/catalog", "/products/gel-pen-set", "/account", "/account/orders", "/account/wishlist", "/account/notifications"])
      expect(feedbackPromptAllowed(path), path).toBe(true);
    for (const path of [
      "/cart",
      "/checkout",
      "/login",
      "/signup",
      "/admin",
      "/super-admin/feedback",
      "/delivery",
      "/school",
      "/account/support",
      "/account/complaints",
      "/account/orders/665f000000000000000000aa",
      "/serviceability",
    ])
      expect(feedbackPromptAllowed(path), path).toBe(false);
  });

  it("calls an unread rating of one or two stars one that needs attention", () => {
    expect(NEEDS_ATTENTION).toEqual({ state: "rated", rating: { $lte: 2 }, readAt: null });
  });
});

describe("order feedback words", () => {
  it("has the same lines in English and Marathi", () => {
    expect(paths(feedbackCopy.mr).sort()).toEqual(paths(feedbackCopy.en).sort());
    for (const tag of FEEDBACK_TAGS) {
      expect(feedbackCopy.en.tags[tag], tag).toBeTruthy();
      expect(feedbackCopy.mr.tags[tag], tag).toBeTruthy();
    }
    expect(feedbackCopy.en.starNames).toHaveLength(5);
    expect(feedbackCopy.mr.starNames).toHaveLength(5);
  });

  it("names each star for screen readers", () => {
    expect(feedbackCopy.en.starLabel(1, "Very poor")).toBe("1 star – Very poor");
    expect(feedbackCopy.en.starLabel(4, "Good")).toBe("4 stars – Good");
    expect(feedbackCopy.mr.starLabel(4, "चांगले")).toBe("4 तारे – चांगले");
    expect(feedbackCopy.en.arrived("AGS-1")).toBe("Order AGS-1 arrived");
  });
});
