import { describe, expect, it } from "vitest";
import { expandUpcE, hasValidCheckDigit, normalizeBarcode } from "../src/lib/barcode.js";

describe("hasValidCheckDigit", () => {
  it.each(["4006381333931", "036000291452", "96385074", "00036000291452"])("accepts %s", (code) => {
    expect(hasValidCheckDigit(code)).toBe(true);
  });

  it.each(["4006381333932", "036000291453", "96385075"])("rejects %s", (code) => {
    expect(hasValidCheckDigit(code)).toBe(false);
  });
});

describe("expandUpcE", () => {
  // Pairs from the GS1 UPC-E zero-suppression rules, each with a valid check digit.
  it.each([
    ["01234505", "012000003455"],
    ["04252614", "042100005264"],
    ["01234133", "012300000413"],
    ["01234145", "012340000015"],
  ])("expands %s to %s", (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA);
  });

  it("rejects a number system other than 0 or 1", () => {
    expect(expandUpcE("21234505")).toBeNull();
  });
});

describe("normalizeBarcode", () => {
  it("keeps a valid EAN-13", () => {
    expect(normalizeBarcode("4006381333931")).toEqual({ ok: true, code: "4006381333931", kind: "gtin" });
  });

  it("stores UPC-A, its EAN-13 form and its GTIN-14 form identically", () => {
    const expected = { ok: true, code: "0036000291452", kind: "gtin" };
    expect(normalizeBarcode("036000291452")).toEqual(expected);
    expect(normalizeBarcode("0036000291452")).toEqual(expected);
    expect(normalizeBarcode("00036000291452")).toEqual(expected);
    expect(normalizeBarcode("036000291452", "UPC-A")).toEqual(expected);
  });

  it("expands a UPC-E scan to the same code as its UPC-A form", () => {
    expect(normalizeBarcode("04252614", "UPC-E")).toEqual(normalizeBarcode("042100005264"));
  });

  it("reads an 8-digit number without a format as EAN-8", () => {
    expect(normalizeBarcode("96385074")).toEqual({ ok: true, code: "96385074", kind: "gtin" });
  });

  it("keeps GTIN-14 codes with a packaging indicator", () => {
    expect(normalizeBarcode("10036000291459")).toEqual({ ok: true, code: "10036000291459", kind: "gtin" });
  });

  it("rejects a wrong check digit", () => {
    expect(normalizeBarcode("4006381333932")).toEqual({ ok: false, error: expect.stringContaining("check digit") });
  });

  it("does not validate check digits for non-retail symbologies", () => {
    expect(normalizeBarcode("4006381333932", "Code128")).toEqual({ ok: true, code: "4006381333932", kind: "other" });
  });

  it("keeps other codes as scanned apart from surrounding whitespace", () => {
    expect(normalizeBarcode("  STV-AB12/x  ")).toEqual({ ok: true, code: "STV-AB12/x", kind: "other" });
    expect(normalizeBarcode("12345")).toEqual({ ok: true, code: "12345", kind: "other" });
    expect(normalizeBarcode("https://example.com/p?id=7", "QRCode")).toEqual({
      ok: true,
      code: "https://example.com/p?id=7",
      kind: "other",
    });
  });

  it("rejects a non-numeric value reported as a retail symbology", () => {
    expect(normalizeBarcode("ABC", "EAN-13").ok).toBe(false);
  });

  it.each([[""], ["   "], ["x".repeat(201)], ["abc\u0007def"]])("rejects %j", (value) => {
    expect(normalizeBarcode(value).ok).toBe(false);
  });
});
