import { describe, expect, it } from "vitest";
import { matchIntent, pinIn, productQuery } from "../src/lib/assistant/intents";
import { assistantCopy, joinList } from "../src/lib/assistant/copy";

describe("What a shopper is asking the assistant", () => {
  it.each([
    ["where is my order?", "order"],
    ["Order status please", "order"],
    ["do you deliver to Roha?", "delivery"],
    ["delivery charges kitna hai", "delivery"],
    ["वितरण कधी होईल", "delivery"],
    ["my pin is 402106", "pin"],
    ["402106", "pin"],
    ["is cash on delivery available?", "payment"],
    ["UPI chalega?", "payment"],
    ["I got a damaged item", "returns"],
    ["माल खराब आला", "returns"],
    ["bulk order for our school", "school"],
    ["talk to the store", "human"],
    ["दुकानाशी बोला", "human"],
    ["hi", "greeting"],
    ["Hello there", "greeting"],
    ["thanks!", "thanks"],
  ])("“%s” is about %s", (text, intent) => {
    expect(matchIntent(text)).toBe(intent);
  });

  it.each(["blue gel pen", "school bag", "return gifts for kids", "greeting cards", "cash book", "safety pins", "वही"])(
    "“%s” is a product search",
    (text) => {
      expect(matchIntent(text)).toBeNull();
    },
  );

  it("finds a PIN code only when it is exactly six digits", () => {
    expect(pinIn("deliver to 402106 please")).toBe("402106");
    expect(pinIn("call 9876543210")).toBeNull();
    expect(pinIn("12345")).toBeNull();
  });

  it("keeps only the product words of a question", () => {
    expect(productQuery("Do you have long notebooks?")).toBe("long notebooks");
    expect(productQuery("मला वही पाहिजे")).toBe("वही");
    expect(productQuery("is there any")).toBe("is there any");
  });

  it("joins lists the way people say them, in both languages", () => {
    expect(joinList(["Nagothane"], "and")).toBe("Nagothane");
    expect(joinList(["Nagothane", "Roha", "Pali"], assistantCopy.en.and)).toBe("Nagothane, Roha and Pali");
    expect(joinList(["नागोठणे", "रोहा"], assistantCopy.mr.and)).toBe("नागोठणे आणि रोहा");
  });

  it("has every sentence in both languages", () => {
    expect(Object.keys(assistantCopy.mr).sort()).toEqual(Object.keys(assistantCopy.en).sort());
    expect(Object.keys(assistantCopy.mr.topics)).toEqual(Object.keys(assistantCopy.en.topics));
  });
});
