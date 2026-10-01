import { expect, it } from "vitest";
import {
  normalizeSearch,
  expandSearch,
  singular,
  searchWords,
  fuzzyPattern,
  patternRelevance,
  relevance,
} from "../src/lib/catalog/search";
it("reduces English plurals so 'pens' finds 'Pen'", () => {
  expect(singular("pens")).toBe("pen");
  expect(singular("boxes")).toBe("box");
  expect(singular("brushes")).toBe("brush");
  expect(singular("diaries")).toBe("diary");
  expect(singular("glass")).toBe("glass");
  expect(singular("pen")).toBe("pen");
  expect(singular("वह्या")).toBe("वह्या");
});
it("gives every word of a query its own alternatives", () => {
  const words = searchWords("Gel PENS");
  expect(words).toHaveLength(2);
  expect(words[0]).toEqual(["gel"]);
  expect(words[1]).toEqual(expect.arrayContaining(["pens", "pen", "kalam", "पेन"]));
  expect(searchWords("vahi")[0]).toEqual(expect.arrayContaining(["notebook", "वही"]));
});
it("forgives one missing, wrong or extra letter, and nothing wilder", () => {
  const match = (typed: string, name: string) => new RegExp(fuzzyPattern(typed), "i").test(name);
  expect(match("notbook", "A5 Notebook")).toBe(true);
  expect(match("notebock", "A5 Notebook")).toBe(true);
  expect(match("noteebook", "A5 Notebook")).toBe(true);
  expect(match("pencel", "HB Pencil")).toBe(true);
  expect(match("notebook", "Gel Pen Set")).toBe(false);
  expect(fuzzyPattern("pen")).toBe("pen");
});
it("ranks typo matches in a product's own name above ones that came in through the aisle", () => {
  const typo = [fuzzyPattern("notbook")];
  const notebook = patternRelevance({ name: { en: "A5 Hardcover Notebook", mr: "" } }, typo);
  const paper = patternRelevance({ name: { en: "A4 Copier Paper", mr: "" }, aliases: ["a4", "paper"] }, typo);
  expect(notebook).toBeGreaterThan(paper);
  expect(paper).toBe(0);
});
it("ranks a whole-word name match above a partial or alias match", () => {
  const words = searchWords("pen");
  const pen = relevance({ name: { en: "Gel Pen Set", mr: "" } }, "pen", words);
  const pencil = relevance({ name: { en: "HB Pencil", mr: "" } }, "pen", words);
  const alias = relevance({ name: { en: "Writing Kit", mr: "" }, aliases: ["pen"] }, "pen", words);
  expect(pen).toBeGreaterThan(pencil);
  expect(pencil).toBeGreaterThan(alias);
});
it("normalizes case, whitespace and punctuation without dropping Marathi vowel marks", () => {
  expect(normalizeSearch("  RICE!!!  ")).toBe("rice");
  expect(normalizeSearch("तांदूळ")).toBe("तांदूळ");
});
it("maps Rice, Chawal and तांदूळ equivalently", () => {
  for (const q of ["Rice", "Chawal", "तांदूळ"])
    expect(expandSearch(q)).toEqual(
      expect.arrayContaining(["rice", "chawal", "तांदूळ"]),
    );
});
it("supports maintained mappings and never expands unrelated terms", () => {
  expect(expandSearch("chai")).toContain("tea");
  expect(expandSearch("unrelated")).toEqual(["unrelated"]);
  expect(expandSearch("sabun", [["soap", "sabun"]])).toContain("soap");
});
