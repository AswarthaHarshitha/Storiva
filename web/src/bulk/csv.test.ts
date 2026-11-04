import { describe, expect, it } from "vitest";
import { autoMap, parseCsv, toImportRows } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and line breaks inside quotes", () => {
    expect(parseCsv('sku,name\r\nA-1,"Mug, ""large"""\nB-2,"Two\nlines"\n')).toEqual([
      ["sku", "name"],
      ["A-1", 'Mug, "large"'],
      ["B-2", "Two\nlines"],
    ]);
  });

  it("ignores a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿sku\n\nA\n,\n")).toEqual([["sku"], ["A"]]);
  });
});

describe("autoMap", () => {
  it("recognises common header names", () => {
    expect(autoMap(["Item Code", "Product Name", "Qty", "Unit Cost", "MRP", "EAN", "Notes"])).toEqual([
      "sku",
      "name",
      "quantity",
      "costPrice",
      "sellingPrice",
      "barcodes",
      null,
    ]);
  });

  it("maps each field once", () => {
    expect(autoMap(["sku", "code"])).toEqual(["sku", null]);
  });

  it("reads Storiva's own export headers", () => {
    expect(autoMap(["sku", "name", "barcodes", "brand", "manufacturer", "category", "description", "quantity", "cost_price", "selling_price", "low_stock_threshold"])).toEqual([
      "sku",
      "name",
      "barcodes",
      "brand",
      "manufacturer",
      "category",
      "description",
      "quantity",
      "costPrice",
      "sellingPrice",
      "lowStockThreshold",
    ]);
  });
});

describe("toImportRows", () => {
  it("keeps mapped columns and undoes the export's formula guard", () => {
    expect(toImportRows([["A-1", "'=SUM(1)", "x"]], ["sku", "name", null])).toEqual([{ sku: "A-1", name: "=SUM(1)" }]);
  });
});
