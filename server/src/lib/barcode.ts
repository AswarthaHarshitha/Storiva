/**
 * Barcode normalization. Retail codes (EAN/UPC/GTIN) are validated and stored as one canonical
 * form, so the same item matches whether its code is printed or scanned as UPC-A, EAN-13 or
 * GTIN-14. Everything else (Code 128, Code 39, QR, ...) is stored exactly as read.
 */

export type BarcodeKind = "gtin" | "other";

export type NormalizedBarcode =
  | { ok: true; code: string; kind: BarcodeKind }
  | { ok: false; error: string };

/** Symbologies whose content is a GTIN and must carry a valid check digit. */
const GTIN_FORMATS = new Set(["EAN-8", "EAN-13", "UPC-A", "UPC-E", "ITF14"]);
const MAX_LENGTH = 200;

/** GS1 mod-10 check: weights 3,1,3,... from the digit left of the check digit. */
export function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Expands an 8-digit UPC-E code (number system 0 or 1) to its 12-digit UPC-A form. */
export function expandUpcE(upcE: string): string | null {
  if (!/^[01]\d{7}$/.test(upcE)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = upcE.split("") as [string, ...string[]];
  let body: string;
  switch (d6) {
    case "0":
    case "1":
    case "2":
      body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case "3":
      body = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case "4":
      body = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default:
      body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  return `${ns}${body}${check}`;
}

/**
 * @param raw    the scanned or typed value
 * @param format the symbology reported by the camera decoder, when known. Hardware scanners and
 *               typing do not report one; an 8-digit number is then read as EAN-8.
 */
export function normalizeBarcode(raw: string, format?: string): NormalizedBarcode {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter or scan a barcode." };
  if (value.length > MAX_LENGTH) return { ok: false, error: `Barcodes are limited to ${MAX_LENGTH} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: "The barcode contains control characters." };

  const numericGtinLength = /^\d+$/.test(value) && [8, 12, 13, 14].includes(value.length);
  const isGtin = format ? GTIN_FORMATS.has(format) : numericGtinLength;
  if (!isGtin) return { ok: true, code: value, kind: "other" };
  if (!numericGtinLength) return { ok: false, error: "That is not a valid EAN or UPC barcode." };

  let digits = value;
  if (format === "UPC-E") {
    const expanded = expandUpcE(value);
    if (!expanded) return { ok: false, error: "That is not a valid UPC-E barcode." };
    digits = expanded;
  }
  if (!hasValidCheckDigit(digits)) {
    return { ok: false, error: "The barcode's check digit is wrong. Check the number and try again." };
  }

  // Canonical form: GTIN-13 for UPC-A and GTIN-14 with indicator 0; EAN-8 and other GTIN-14s as is.
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length === 14 && digits.startsWith("0")) digits = digits.slice(1);
  return { ok: true, code: digits, kind: "gtin" };
}
