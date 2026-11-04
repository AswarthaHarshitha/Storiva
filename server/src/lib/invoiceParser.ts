/**
 * Reads the structure of an invoice from its text (typically OCR output). Deliberately
 * conservative: it reports what it finds and leaves anything unclear for the person reviewing.
 * Nothing it returns is applied to stock without confirmation.
 */

export interface ParsedLine {
  description: string;
  quantity: number;
  unitCost: string | null;
  amount: string | null;
  /** quantity × unit cost equals the line amount (within a cent or two). */
  consistent: boolean | null;
  raw: string;
}

export interface ParsedInvoice {
  supplier: string | null;
  invoiceNumber: string | null;
  date: string | null;
  total: string | null;
  lines: ParsedLine[];
  /** Lines that looked like items but could not be read reliably. */
  unreadLines: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SUMMARY = /\b(sub\s*-?\s*total|total|tax|gst|vat|cgst|sgst|igst|discount|shipping|freight|balance|amount\s+due|round(ing)?\s*off|paid)\b/i;
const MONEY = String.raw`(?:[₹$£€]|rs\.?\s*)?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2}))`;

const money = (text: string | undefined): string | null => {
  if (!text) return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : null;
};

function parseDate(text: string): string | null {
  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})\b/i.exec(text) ?? null;
  if (named) return valid(Number(named[3]), MONTHS.indexOf((named[2] ?? "").toLowerCase().slice(0, 3)) + 1, Number(named[1]));
  const us = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(text);
  if (us) return valid(Number(us[3]), MONTHS.indexOf((us[1] ?? "").toLowerCase().slice(0, 3)) + 1, Number(us[2]));
  // Numeric dates are read day-first (dd/mm/yyyy), the usual order on Indian and European invoices.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return valid(year, Number(numeric[2]), Number(numeric[1]));
  }
  return null;
}

function valid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

function parseLine(line: string): ParsedLine | null {
  // description  qty  unit-price  [amount]
  const trailing = new RegExp(String.raw`^(.*?[A-Za-z].*?)\s+(\d{1,5})\s*(?:x|pcs|nos|units?|ea)?\s+${MONEY}(?:\s+${MONEY})?\s*$`, "i").exec(line);
  // qty [x] description  unit-price  [amount]
  const leading = new RegExp(String.raw`^(\d{1,5})\s*(?:x|pcs|nos|units?|ea)?\s+(.*?[A-Za-z].*?)\s+${MONEY}(?:\s+${MONEY})?\s*$`, "i").exec(line);
  const m = trailing
    ? { description: trailing[1], qty: trailing[2], first: trailing[3], second: trailing[4] }
    : leading
      ? { description: leading[2], qty: leading[1], first: leading[3], second: leading[4] }
      : null;
  if (!m?.description || !m.qty) return null;
  const quantity = Number(m.qty);
  if (quantity <= 0) return null;
  const unitCost = money(m.first);
  const amount = money(m.second);
  const consistent = unitCost !== null && amount !== null ? Math.abs(quantity * Number(unitCost) - Number(amount)) <= 0.02 : null;
  return {
    description: m.description.replace(/^[\s\-.:#\d]*?(?=[A-Za-z])/, "").replace(/\s{2,}/g, " ").trim(),
    quantity,
    unitCost,
    amount,
    consistent,
    raw: line,
  };
}

export function parseInvoiceText(text: string): ParsedInvoice {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[|]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const joined = lines.join("\n");
  const invoiceNumber =
    /\b(?:invoice|inv|bill)\s*(?:no\.?|number|num|#)\s*[:#.]?\s*([A-Z0-9][A-Z0-9/-]{1,30})/i.exec(joined)?.[1] ??
    /\b(?:invoice|inv)\s*[:#]\s*([A-Z0-9][A-Z0-9/-]{1,30})/i.exec(joined)?.[1] ??
    null;
  const dateLine = lines.find((l) => /\bdate\b/i.test(l) && parseDate(l)) ?? lines.find((l) => parseDate(l));
  const totals = lines.filter((l) => /\btotal\b/i.test(l) && !/\bsub\s*-?\s*total\b/i.test(l));
  const totalLine = totals.find((l) => /grand\s+total|total\s+(amount|due)/i.test(l)) ?? totals.at(-1);
  const total = totalLine ? money(new RegExp(`${MONEY}\\s*$`).exec(totalLine)?.[1]) : null;
  const supplier =
    lines.find(
      (l) =>
        /[a-z]{3}/i.test(l) &&
        !/\b(tax\s+)?invoice\b|\breceipt\b|\bbill\b|\bdate\b|\bgstin\b|\bphone\b|\btel\b|@|www\./i.test(l) &&
        !parseLine(l),
    ) ?? null;

  const parsed: ParsedLine[] = [];
  const unreadLines: string[] = [];
  for (const line of lines) {
    if (SUMMARY.test(line) || line === supplier) continue;
    const item = parseLine(line);
    if (item) parsed.push(item);
    else if (/[a-z]{3}/i.test(line) && /\d+(?:\.\d{2})\s*$/.test(line) && !/\bdate\b|invoice/i.test(line)) unreadLines.push(line);
  }

  return { supplier, invoiceNumber, date: dateLine ? parseDate(dateLine) : null, total, lines: parsed, unreadLines };
}
