import { describe, expect, it } from "vitest";
import { parseInvoiceText } from "../src/lib/invoiceParser.js";

// Synthetic invoices for tests only.
const invoice = `
Bright Electricals Pvt Ltd
12 Market Road, Hyderabad
TAX INVOICE
Invoice No: INV-2026/0147
Date: 04/11/2026
Description              Qty   Rate     Amount
Wireless Optical Mouse    10   450.00   4,500.00
USB-C Cable 1m            25    89.50   2,237.50
Surge Protector 6 Socket   4  1,250.00  5,000.00
Sub Total                                 11,737.50
GST 18%                                    2,112.75
Grand Total                               13,850.25
`;

describe("parseInvoiceText", () => {
  const parsed = parseInvoiceText(invoice);

  it("reads the header fields", () => {
    expect(parsed).toMatchObject({
      supplier: "Bright Electricals Pvt Ltd",
      invoiceNumber: "INV-2026/0147",
      date: "2026-11-04",
      total: "13850.25",
    });
  });

  it("reads item lines with quantity, unit cost and amount, and checks the arithmetic", () => {
    expect(parsed.lines).toEqual([
      expect.objectContaining({ description: "Wireless Optical Mouse", quantity: 10, unitCost: "450.00", amount: "4500.00", consistent: true }),
      expect.objectContaining({ description: "USB-C Cable 1m", quantity: 25, unitCost: "89.50", amount: "2237.50", consistent: true }),
      expect.objectContaining({ description: "Surge Protector 6 Socket", quantity: 4, unitCost: "1250.00", amount: "5000.00", consistent: true }),
    ]);
  });

  it("does not treat totals and taxes as items", () => {
    expect(parsed.lines.map((l) => l.description).join(" ")).not.toMatch(/total|gst/i);
  });

  it("flags a line whose amount does not equal quantity × unit cost", () => {
    const result = parseInvoiceText("Stapler Standard 3 120.00 400.00");
    expect(result.lines[0]).toMatchObject({ quantity: 3, consistent: false });
  });

  it("reads quantity-first lines", () => {
    expect(parseInvoiceText("2 x Desk Organizer 349.00").lines[0]).toMatchObject({ description: "Desk Organizer", quantity: 2, unitCost: "349.00", amount: null, consistent: null });
  });

  it.each([
    ["Date: 2026-11-04", "2026-11-04"],
    ["Dated 4 Nov 2026", "2026-11-04"],
    ["Nov 4, 2026", "2026-11-04"],
    ["Date 31/02/2026", null],
  ])("reads the date in %j", (text, expected) => {
    expect(parseInvoiceText(text).date).toBe(expected);
  });

  it("returns empty fields rather than guessing when the text has no structure", () => {
    expect(parseInvoiceText("blurry photo")).toMatchObject({ invoiceNumber: null, date: null, total: null, lines: [] });
  });
});
