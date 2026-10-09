import { describe, expect, it } from "vitest";
import { headerPositions, parseCsv, toCsv } from "../src/lib/inventory/csv";

describe("Stock sheet CSV", () => {
  it("reads quoted fields, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('sku,reason\nNB-1,"Counted, shelf 2"\nNB-2,"Said ""damp"""\nNB-3,"two\nlines"\n')).toEqual([
      ["sku", "reason"],
      ["NB-1", "Counted, shelf 2"],
      ["NB-2", 'Said "damp"'],
      ["NB-3", "two\nlines"],
    ]);
  });

  it("copes with Excel's byte-order mark, Windows line endings and empty rows at the end", () => {
    expect(parseCsv("﻿sku,count\r\nNB-1,4\r\n,\r\n\r\n")).toEqual([
      ["sku", "count"],
      ["NB-1", "4"],
    ]);
  });

  it("keeps a last row with no line break after it", () => {
    expect(parseCsv("sku,change\nNB-1,-3")).toEqual([
      ["sku", "change"],
      ["NB-1", "-3"],
    ]);
  });

  it("writes cells a spreadsheet reads back the same, and never as a formula", () => {
    const csv = toCsv([
      ["sku", "product", "on_shelf"],
      ["NB-1", 'Notebook, "long"', 12],
      ["=HYPERLINK(1)", "+91", -3],
    ]);
    expect(csv).toBe('sku,product,on_shelf\r\nNB-1,"Notebook, ""long""",12\r\n\'=HYPERLINK(1),\'+91,-3\r\n');
    expect(parseCsv(csv)[1]).toEqual(["NB-1", 'Notebook, "long"', "12"]);
  });

  it("finds the columns by their usual names, in any order and case", () => {
    expect(headerPositions(["Product", "Item Code", "on_shelf", "New Count", "Notes"])).toEqual({ sku: 1, count: 3, reason: 4 });
    expect(headerPositions(["SKU", "+/-"])).toEqual({ sku: 0, change: 1 });
    expect(headerPositions(["name", "price"])).toEqual({});
  });
});
