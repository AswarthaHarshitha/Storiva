/** Parses CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_FIELDS = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Name", required: false },
  { key: "description", label: "Description", required: false },
  { key: "brand", label: "Brand", required: false },
  { key: "manufacturer", label: "Manufacturer", required: false },
  { key: "category", label: "Category", required: false },
  { key: "quantity", label: "Quantity (set to)", required: false },
  { key: "adjust", label: "Adjust by (+/−)", required: false },
  { key: "costPrice", label: "Cost price", required: false },
  { key: "sellingPrice", label: "Selling price", required: false },
  { key: "lowStockThreshold", label: "Low-stock threshold", required: false },
  { key: "barcodes", label: "Barcodes", required: false },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

const SYNONYMS: Record<ImportField, string[]> = {
  sku: ["sku", "item code", "product code", "code", "article", "part number", "item no"],
  name: ["name", "product", "product name", "item", "item name", "title"],
  description: ["description", "details", "desc"],
  brand: ["brand", "make"],
  manufacturer: ["manufacturer", "maker", "producer"],
  category: ["category", "group", "department", "type"],
  quantity: ["quantity", "qty", "quantity on hand", "stock", "on hand", "units", "count"],
  adjust: ["adjust", "adjustment", "change", "delta"],
  costPrice: ["cost price", "cost", "purchase price", "buy price", "unit cost"],
  sellingPrice: ["selling price", "price", "sale price", "retail price", "mrp", "sell price"],
  lowStockThreshold: ["low stock threshold", "threshold", "reorder level", "reorder point", "min stock", "minimum"],
  barcodes: ["barcode", "barcodes", "ean", "upc", "gtin", "ean13"],
};

const norm = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Matches file headers to Storiva fields by common names; unmatched headers are ignored. */
export function autoMap(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    const h = norm(header);
    const field = (Object.keys(SYNONYMS) as ImportField[]).find((f) => !used.has(f) && SYNONYMS[f].includes(h));
    if (field) used.add(field);
    return field ?? null;
  });
}

/** Builds import rows from data rows and a column mapping. */
export function toImportRows(data: string[][], mapping: (ImportField | null)[]): Partial<Record<ImportField, string>>[] {
  return data.map((cells) => {
    const row: Partial<Record<ImportField, string>> = {};
    mapping.forEach((field, i) => {
      if (field) row[field] = (cells[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
    });
    return row;
  });
}
