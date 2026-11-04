import { Prisma } from "@prisma/client";
import { normalizeBarcode } from "../lib/barcode.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prismaErrors.js";
import { fieldValues, TRACKED_FIELDS } from "./evidenceService.js";
import { applyWithin } from "./stockService.js";

export const IMPORT_COLUMNS = [
  "sku",
  "name",
  "description",
  "brand",
  "manufacturer",
  "category",
  "quantity",
  "adjust",
  "costPrice",
  "sellingPrice",
  "lowStockThreshold",
  "barcodes",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRow = Partial<Record<ImportColumn, string>>;

const MAX_QUANTITY = 1_000_000_000;
const SKU = /^[A-Za-z0-9._\-/]{1,64}$/;
const PRICE = /^\d{1,10}(\.\d{1,2})?$/;
const LIMITS: Partial<Record<ImportColumn, number>> = { name: 200, description: 2000, brand: 120, manufacturer: 200, category: 200 };

export interface RowChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface RowPlan {
  row: number;
  sku: string;
  action: "create" | "update" | "unchanged" | "error";
  productId: string | null;
  name: string | null;
  changes: RowChange[];
  quantityDelta: number;
  barcodes: string[];
  errors: { field: string; message: string }[];
}

type Existing = Awaited<ReturnType<typeof loadExisting>>;

async function loadExisting(db: Prisma.TransactionClient | typeof prisma, organizationId: string) {
  const [products, barcodes] = await Promise.all([
    db.product.findMany({ where: { organizationId } }),
    db.productBarcode.findMany({ where: { organizationId }, select: { code: true, productId: true } }),
  ]);
  return {
    bySku: new Map(products.map((p) => [p.sku.toLowerCase(), p])),
    barcodeOwner: new Map(barcodes.map((b) => [b.code, b.productId])),
  };
}

const text = (v: string | undefined) => (v ?? "").trim();
const int = (v: string) => (/^-?\d+$/.test(v) ? Number(v) : NaN);

/** Validates every row and works out exactly what it would change. Nothing is written. */
export function planRows(rows: ImportRow[], existing: Existing): RowPlan[] {
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();
  return rows.map((raw, index) => {
    const row = index + 2; // spreadsheet row number, after the header
    const errors: RowPlan["errors"] = [];
    const err = (field: string, message: string) => errors.push({ field, message });
    const sku = text(raw.sku);
    if (!sku) err("sku", "SKU is required.");
    else if (!SKU.test(sku)) err("sku", "SKU may contain letters, numbers, dots, dashes, slashes or underscores (up to 64).");
    const key = sku.toLowerCase();
    if (sku && seenSku.has(key)) err("sku", `Duplicate of row ${seenSku.get(key)} in this file.`);
    else if (sku) seenSku.set(key, row);

    const product = sku ? existing.bySku.get(key) : undefined;
    for (const [col, max] of Object.entries(LIMITS)) {
      if (text(raw[col as ImportColumn]).length > max) err(col, `Use at most ${max} characters.`);
    }
    const name = text(raw.name);
    if (!product && !name) err("name", "Name is required for a new product.");

    const quantityText = text(raw.quantity);
    const adjustText = text(raw.adjust);
    if (quantityText && adjustText) err("quantity", "Use either quantity or adjust in one row, not both.");
    let quantityDelta = 0;
    let newQuantity: number | null = null;
    if (quantityText) {
      const q = int(quantityText);
      if (!Number.isInteger(q) || q < 0 || q > MAX_QUANTITY) err("quantity", "Quantity must be a whole number, 0 or more.");
      else newQuantity = q;
    }
    if (adjustText) {
      const d = int(adjustText);
      if (!Number.isInteger(d) || d === 0 || Math.abs(d) > MAX_QUANTITY) err("adjust", "Adjust must be a non-zero whole number, e.g. 5 or -2.");
      else quantityDelta = d;
    }
    const current = product?.quantityOnHand ?? 0;
    if (newQuantity !== null) quantityDelta = newQuantity - current;
    if (product && current + quantityDelta < 0) err("adjust", `Only ${current} units are on hand.`);
    if (!product && quantityDelta < 0) err("adjust", "A new product cannot start below zero.");

    for (const col of ["costPrice", "sellingPrice"] as const) {
      const v = text(raw[col]);
      if (v && !PRICE.test(v.replace(/,/g, ""))) err(col, "Use a non-negative amount with up to 2 decimals.");
    }
    const threshold = text(raw.lowStockThreshold);
    if (threshold && (!/^\d+$/.test(threshold) || Number(threshold) > MAX_QUANTITY)) err("lowStockThreshold", "Threshold must be a whole number, 0 or more.");

    const barcodes: string[] = [];
    for (const code of text(raw.barcodes).split(/[;|]/).map((c) => c.trim()).filter(Boolean)) {
      const normalized = normalizeBarcode(code);
      if (!normalized.ok) {
        err("barcodes", `${code}: ${normalized.error}`);
        continue;
      }
      const owner = existing.barcodeOwner.get(normalized.code);
      if (owner && owner !== product?.id) err("barcodes", `${code} already belongs to another product.`);
      else if (seenBarcode.has(normalized.code) && seenBarcode.get(normalized.code) !== row) err("barcodes", `${code} is also used in row ${seenBarcode.get(normalized.code)}.`);
      else if (!owner) {
        seenBarcode.set(normalized.code, row);
        if (!barcodes.includes(normalized.code)) barcodes.push(normalized.code);
      }
    }

    // Field changes: blank cells leave an existing product's value unchanged.
    const changes: RowChange[] = [];
    const before = product ? { ...fieldValues(product), lowStockThreshold: product.lowStockThreshold?.toString() ?? null } : null;
    const fields: [string, string][] = [
      ["name", name],
      ["description", text(raw.description)],
      ["brand", text(raw.brand)],
      ["manufacturer", text(raw.manufacturer)],
      ["category", text(raw.category)],
      ["costPrice", text(raw.costPrice) ? Number(text(raw.costPrice).replace(/,/g, "")).toFixed(2) : ""],
      ["sellingPrice", text(raw.sellingPrice) ? Number(text(raw.sellingPrice).replace(/,/g, "")).toFixed(2) : ""],
      ["lowStockThreshold", threshold],
    ];
    for (const [field, value] of fields) {
      if (!value) continue;
      const from = before ? ((before as Record<string, string | null>)[field] ?? null) : null;
      if (from !== value) changes.push({ field, from, to: value });
    }
    if (quantityDelta !== 0 || (!product && newQuantity !== null)) {
      changes.push({ field: "quantity", from: product ? String(current) : null, to: String(current + quantityDelta) });
    }
    for (const code of barcodes) changes.push({ field: "barcode", from: null, to: code });

    const action: RowPlan["action"] = errors.length > 0 ? "error" : !product ? "create" : changes.length > 0 ? "update" : "unchanged";
    return { row, sku, action, productId: product?.id ?? null, name: name || product?.name || null, changes, quantityDelta, barcodes, errors };
  });
}

export async function previewImport(organizationId: string, rows: ImportRow[]) {
  const plan = planRows(rows, await loadExisting(prisma, organizationId));
  return { rows: plan, summary: summarize(plan) };
}

function summarize(plan: RowPlan[]) {
  return {
    total: plan.length,
    create: plan.filter((r) => r.action === "create").length,
    update: plan.filter((r) => r.action === "update").length,
    unchanged: plan.filter((r) => r.action === "unchanged").length,
    errors: plan.filter((r) => r.action === "error").length,
    stockChanges: plan.filter((r) => r.action !== "error" && r.quantityDelta !== 0).length,
  };
}

const decimal = (v: string | undefined) => (v ? new Prisma.Decimal(v) : undefined);

/**
 * Applies every valid row in a single transaction; rows with errors are left out and recorded in
 * the import's error report. If anything fails while writing, nothing is applied.
 */
export async function commitImport(organizationId: string, userId: string, fileName: string, rows: ImportRow[]) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const plan = planRows(rows, await loadExisting(tx, organizationId));
        const summary = summarize(plan);
        const valid = plan.filter((r) => r.action === "create" || r.action === "update");
        const batch = await tx.importBatch.create({
          data: {
            organizationId,
            userId,
            fileName,
            createdCount: summary.create,
            updatedCount: summary.update,
            adjustedCount: summary.stockChanges,
            skippedCount: summary.errors,
            errors: plan.filter((r) => r.action === "error").flatMap((r) => r.errors.map((e) => ({ row: r.row, sku: r.sku, ...e }))),
          },
        });
        const reference = { type: "import", id: batch.id };
        const origin = { source: "import", status: "entered" as const, detail: fileName.slice(0, 200), referenceType: "import", referenceId: batch.id, userId, organizationId };
        const value = (r: RowPlan, field: string) => r.changes.find((c) => c.field === field)?.to ?? undefined;

        // New products: written in batches.
        const creates = valid.filter((r) => r.action === "create");
        const created = creates.length
          ? await tx.product.createManyAndReturn({
              data: creates.map((r) => ({
                organizationId,
                sku: r.sku,
                name: value(r, "name") ?? r.sku,
                description: value(r, "description") ?? null,
                brand: value(r, "brand") ?? null,
                manufacturer: value(r, "manufacturer") ?? null,
                category: value(r, "category") ?? null,
                quantityOnHand: r.quantityDelta,
                costPrice: decimal(value(r, "costPrice")) ?? null,
                sellingPrice: decimal(value(r, "sellingPrice")) ?? null,
                lowStockThreshold: value(r, "lowStockThreshold") ? Number(value(r, "lowStockThreshold")) : null,
                lastUpdatedById: userId,
              })),
            })
          : [];
        const idBySku = new Map(created.map((p) => [p.sku.toLowerCase(), p]));
        await tx.stockMovement.createMany({
          data: created.map((p) => ({
            organizationId,
            productId: p.id,
            productSku: p.sku,
            productName: p.name,
            type: "create" as const,
            source: "import" as const,
            quantityBefore: 0,
            quantityChange: p.quantityOnHand,
            quantityAfter: p.quantityOnHand,
            userId,
            referenceType: reference.type,
            referenceId: reference.id,
          })),
        });

        // Existing products: field updates and stock changes through the ledger.
        for (const r of valid.filter((x) => x.action === "update")) {
          const id = r.productId as string;
          const data: Prisma.ProductUpdateInput = {};
          for (const c of r.changes) {
            if (c.field === "quantity" || c.field === "barcode" || c.to === null) continue;
            if (c.field === "costPrice" || c.field === "sellingPrice") data[c.field] = new Prisma.Decimal(c.to);
            else if (c.field === "lowStockThreshold") data.lowStockThreshold = Number(c.to);
            else (data as Record<string, string>)[c.field] = c.to;
          }
          if (Object.keys(data).length > 0) await tx.product.update({ where: { id }, data: { ...data, lastUpdatedBy: { connect: { id: userId } } } });
          if (r.quantityDelta !== 0) {
            const current = await tx.product.findUniqueOrThrow({ where: { id }, select: { quantityOnHand: true } });
            await applyWithin(tx, organizationId, userId, {
              productId: id,
              operation: { type: "adjust", delta: r.quantityDelta, expectedQuantity: current.quantityOnHand },
              source: "import",
              note: `Import: ${fileName}`.slice(0, 200),
              reference,
            });
          }
        }

        // Evidence and barcodes for every applied row.
        const evidence: Prisma.ProductEvidenceCreateManyInput[] = [];
        const barcodeRows: Prisma.ProductBarcodeCreateManyInput[] = [];
        for (const r of valid) {
          const productId = r.productId ?? idBySku.get(r.sku.toLowerCase())?.id;
          if (!productId) continue;
          for (const c of r.changes) {
            if (c.field in TRACKED_FIELDS) evidence.push({ ...origin, productId, field: c.field, value: c.to });
          }
          for (const code of r.barcodes) {
            const normalized = normalizeBarcode(code);
            barcodeRows.push({ organizationId, productId, code, rawCode: code, kind: normalized.ok ? normalized.kind : "other", createdById: userId });
          }
        }
        if (evidence.length) await tx.productEvidence.createMany({ data: evidence });
        if (barcodeRows.length) await tx.productBarcode.createMany({ data: barcodeRows });

        return { importId: batch.id, summary, errors: plan.filter((r) => r.action === "error") };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "INVENTORY_CHANGED", "Your inventory changed while the import was running, so nothing was imported. Preview the file again and retry.");
    }
    throw error;
  }
}

const CSV_HEADER = ["sku", "name", "barcodes", "brand", "manufacturer", "category", "description", "quantity", "cost_price", "selling_price", "low_stock_threshold"];

/** Quotes a CSV cell, and neutralizes text a spreadsheet would run as a formula. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportCsv(organizationId: string) {
  const products = await prisma.product.findMany({
    where: { organizationId },
    orderBy: [{ name: "asc" }, { sku: "asc" }],
    include: { barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } } },
  });
  const lines = [CSV_HEADER.join(",")];
  for (const p of products) {
    lines.push(
      [
        cell(p.sku),
        cell(p.name),
        cell(p.barcodes.map((b) => b.code).join(";")),
        cell(p.brand),
        cell(p.manufacturer),
        cell(p.category),
        cell(p.description),
        cell(p.quantityOnHand),
        cell(p.costPrice?.toFixed(2) ?? null),
        cell(p.sellingPrice?.toFixed(2) ?? null),
        cell(p.lowStockThreshold),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
