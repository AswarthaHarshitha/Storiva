import { describe, expect, it } from "vitest";
import { rankMatches, similarity, squash, tokens } from "../src/lib/textMatch.js";

const products = [
  { id: "1", name: "Wireless Optical Mouse", sku: "COMP-001", brand: "Logi", barcodes: ["0097855066602"] },
  { id: "2", name: "Wired Optical Mouse", sku: "COMP-003" },
  { id: "3", name: "Over-Ear Bluetooth Headphones", sku: "ELEC-004" },
  { id: "4", name: "USB-C Cable 1m", sku: "MOB-007" },
];

describe("tokens", () => {
  it("lower-cases, strips punctuation and accents", () => {
    expect(tokens("Café-Crème, 2x USB-C!")).toEqual(["cafe", "creme", "2x", "usb"]);
  });
});

describe("similarity", () => {
  it("is 1 for the same words and 0 for none", () => {
    expect(similarity("wired optical mouse", "Wired Optical Mouse")).toBe(1);
    expect(similarity("desk lamp", "Wired Optical Mouse")).toBe(0);
  });

  it("gives partial credit for plural and singular forms", () => {
    expect(similarity("bluetooth headphone over ear", "Over-Ear Bluetooth Headphones")).toBeGreaterThan(0.8);
  });
});

describe("rankMatches", () => {
  it("treats a SKU in the text as an exact match", () => {
    const [top] = rankMatches("2 x COMP-003 mouse 450.00", products);
    expect(top).toMatchObject({ product: { id: "2" }, confidence: "exact", score: 1 });
  });

  it("treats a barcode in the text as an exact match", () => {
    expect(rankMatches("item 0097855066602", products)[0]).toMatchObject({ product: { id: "1" }, confidence: "exact" });
  });

  it("ranks by word similarity and labels confidence", () => {
    const matches = rankMatches("Wireless Optical Mouse black", products);
    expect(matches[0]).toMatchObject({ product: { id: "1" }, confidence: "high" });
    expect(matches[1]?.product.id).toBe("2");
    expect(matches[1]?.confidence).not.toBe("high");
  });

  it("returns nothing for unrelated text", () => {
    expect(rankMatches("garden hose 20m", products)).toEqual([]);
  });
});

describe("OCR-tolerant matching", () => {
  const products = [
    { id: "a", name: "QA Item 12", sku: "QA-012" },
    { id: "b", name: "QA Item 13", sku: "QA-013" },
    { id: "c", name: "Bolt", sku: "B-1" },
    { id: "d", name: "QA Item 1", sku: "QA-001" },
  ];

  it("offers a product whose name OCR ran together and misread", () => {
    const [top, ...rest] = rankMatches("QAltem12 3 13.00 39.00", products);
    expect(top?.product.id).toBe("a");
    expect(top?.confidence).toBe("medium");
    expect(rest.map((m) => m.product.id)).not.toContain("b");
    expect(rest.map((m) => m.product.id)).not.toContain("d");
  });

  it("does not fold short names, which would match by accident", () => {
    expect(rankMatches("Bo1tz", products).map((m) => m.product.id)).not.toContain("c");
  });

  it("folds look-alike characters but keeps other digits distinct", () => {
    expect(squash("QA Item 10")).toBe(squash("QAltemlO"));
    expect(squash("Item 12")).not.toBe(squash("Item 13"));
  });
});

