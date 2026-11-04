import { Prisma } from "@prisma/client";
import { HttpError, notFound } from "../lib/errors.js";
import { parseInvoiceText } from "../lib/invoiceParser.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prismaErrors.js";
import { rankMatches, similarity } from "../lib/textMatch.js";
import { fieldValues, recordFieldChanges } from "./evidenceService.js";
import { applyWithin } from "./stockService.js";

// ---------- Suppliers ----------

export interface SupplierInput {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

const supplierTaken = () =>
  new HttpError(409, "SUPPLIER_EXISTS", "A supplier with this name already exists.", { name: "A supplier with this name already exists." });

export async function listSuppliers(organizationId: string) {
  const suppliers = await prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  const reliability = await Promise.all(suppliers.map((s) => supplierReliability(organizationId, s.id)));
  return suppliers.map((s, i) => ({ ...s, reliability: reliability[i] }));
}

export async function saveSupplier(organizationId: string, input: SupplierInput, id?: string) {
  try {
    if (!id) return await prisma.supplier.create({ data: { ...input, organizationId } });
    const { count } = await prisma.supplier.updateMany({ where: { id, organizationId }, data: input });
    if (count === 0) throw notFound("Supplier");
    return await prisma.supplier.findUniqueOrThrow({ where: { id } });
  } catch (error) {
    if (isUniqueViolation(error)) throw supplierTaken();
    throw error;
  }
}

export async function deleteSupplier(organizationId: string, id: string) {
  const { count } = await prisma.supplier.deleteMany({ where: { id, organizationId } });
  if (count === 0) throw notFound("Supplier");
}

/**
 * How a supplier's deliveries compared with what was expected, from confirmed receipts only.
 * Returns null when there is no evidence yet, rather than a score with nothing behind it.
 */
export async function supplierReliability(organizationId: string, supplierId: string) {
  const receipts = await prisma.receipt.findMany({
    where: { organizationId, supplierId, status: "confirmed" },
    include: { lines: true },
  });
  if (receipts.length === 0) return null;
  const lines = receipts.flatMap((r) => r.lines);
  const withExpected = lines.filter((l) => l.expectedQuantity !== null);
  const expected = withExpected.reduce((s, l) => s + (l.expectedQuantity ?? 0), 0);
  const receivedAgainstExpected = withExpected.reduce((s, l) => s + Math.min(l.receivedQuantity, l.expectedQuantity ?? 0), 0);
  const received = lines.reduce((s, l) => s + l.receivedQuantity, 0);
  const damaged = lines.reduce((s, l) => s + l.damagedQuantity, 0);
  const dated = receipts.filter((r) => r.expectedDate && r.confirmedAt);
  const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";
  const late = dated.filter((r) => day(r.confirmedAt) > day(r.expectedDate)).length;
  return {
    receipts: receipts.length,
    linesWithExpectedQuantity: withExpected.length,
    fillRate: expected > 0 ? Math.round((receivedAgainstExpected / expected) * 1000) / 10 : null,
    shortLines: withExpected.filter((l) => l.receivedQuantity < (l.expectedQuantity ?? 0)).length,
    damagedRate: received > 0 ? Math.round((damaged / received) * 1000) / 10 : null,
    deliveriesWithDueDate: dated.length,
    lateDeliveries: late,
  };
}

// ---------- Receipts ----------

export interface ReceiptLineInput {
  productId: string | null;
  description: string;
  expectedQuantity: number | null;
  receivedQuantity: number;
  damagedQuantity: number;
  unitCost: string | null;
  updateCost: boolean;
  matchConfidence: string | null;
}

export interface ReceiptInput {
  supplierId: string | null;
  reference: string | null;
  documentDate: string | null;
  expectedDate: string | null;
  source: "manual" | "invoice";
  documentText: string | null;
  totalAmount: string | null;
  notes: string | null;
  lines: ReceiptLineInput[];
}

async function assertOwned(tx: Prisma.TransactionClient, organizationId: string, input: ReceiptInput) {
  if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, organizationId }, select: { id: true } }))) {
    throw new HttpError(422, "VALIDATION_FAILED", "Some fields need attention.", { supplierId: "Choose one of your suppliers." });
  }
  const ids = [...new Set(input.lines.map((l) => l.productId).filter((id): id is string => Boolean(id)))];
  const owned = await tx.product.count({ where: { organizationId, id: { in: ids } } });
  if (owned !== ids.length) throw new HttpError(422, "VALIDATION_FAILED", "Some fields need attention.", { lines: "A line refers to a product that is not in your inventory." });
}

const receiptData = (input: ReceiptInput) => ({
  supplierId: input.supplierId,
  reference: input.reference,
  documentDate: input.documentDate ? new Date(input.documentDate) : null,
  expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
  source: input.source,
  documentText: input.documentText,
  totalAmount: input.totalAmount === null ? null : new Prisma.Decimal(input.totalAmount),
  notes: input.notes,
});

const lineData = (organizationId: string, lines: ReceiptLineInput[]) =>
  lines.map((l, position) => ({
    organizationId,
    position,
    productId: l.productId,
    description: l.description,
    expectedQuantity: l.expectedQuantity,
    receivedQuantity: l.receivedQuantity,
    damagedQuantity: l.damagedQuantity,
    unitCost: l.unitCost === null ? null : new Prisma.Decimal(l.unitCost),
    updateCost: l.updateCost,
    matchConfidence: l.matchConfidence,
  }));

export async function createReceipt(organizationId: string, userId: string, input: ReceiptInput) {
  const id = await prisma.$transaction(async (tx) => {
    await assertOwned(tx, organizationId, input);
    const receipt = await tx.receipt.create({ data: { ...receiptData(input), organizationId, createdById: userId } });
    await tx.receiptLine.createMany({ data: lineData(organizationId, input.lines).map((l) => ({ ...l, receiptId: receipt.id })) });
    return receipt.id;
  });
  return getReceipt(organizationId, id);
}

export async function updateReceipt(organizationId: string, id: string, input: ReceiptInput) {
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM receipts WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    if (!row) throw notFound("Receipt");
    if (row.status !== "draft") throw new HttpError(409, "RECEIPT_CONFIRMED", "A confirmed receipt cannot be changed.");
    await assertOwned(tx, organizationId, input);
    await tx.receipt.update({ where: { id }, data: receiptData(input) });
    await tx.receiptLine.deleteMany({ where: { receiptId: id, organizationId } });
    await tx.receiptLine.createMany({ data: lineData(organizationId, input.lines).map((l) => ({ ...l, receiptId: id })) });
  });
  return getReceipt(organizationId, id);
}

export async function deleteDraftReceipt(organizationId: string, id: string) {
  const { count } = await prisma.receipt.deleteMany({ where: { id, organizationId, status: "draft" } });
  if (count === 0) {
    if (await prisma.receipt.findFirst({ where: { id, organizationId }, select: { id: true } })) {
      throw new HttpError(409, "RECEIPT_CONFIRMED", "A confirmed receipt cannot be deleted.");
    }
    throw notFound("Receipt");
  }
}

export async function listReceipts(organizationId: string) {
  const receipts = await prisma.receipt.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { supplier: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
  });
  return receipts.map((r) => ({
    id: r.id,
    reference: r.reference,
    supplier: r.supplier,
    status: r.status,
    source: r.source,
    documentDate: r.documentDate,
    totalAmount: r.totalAmount?.toFixed(2) ?? null,
    lineCount: r._count.lines,
    confirmedAt: r.confirmedAt,
    createdAt: r.createdAt,
  }));
}

export async function getReceipt(organizationId: string, id: string) {
  const r = await prisma.receipt.findFirst({
    where: { id, organizationId },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { id: true, name: true, sku: true, quantityOnHand: true, costPrice: true } } } },
    },
  });
  if (!r) throw notFound("Receipt");
  return {
    ...r,
    totalAmount: r.totalAmount?.toFixed(2) ?? null,
    documentDate: r.documentDate?.toISOString().slice(0, 10) ?? null,
    expectedDate: r.expectedDate?.toISOString().slice(0, 10) ?? null,
    lines: r.lines.map((l) => ({
      ...l,
      unitCost: l.unitCost?.toFixed(2) ?? null,
      product: l.product ? { ...l.product, costPrice: l.product.costPrice?.toFixed(2) ?? null } : null,
    })),
  };
}

/**
 * Applies a reviewed receipt: adds the usable units (received minus damaged) of every matched
 * line to stock, optionally updates cost prices, and marks the receipt confirmed, all in one
 * transaction. Confirming twice is refused, so a double click cannot receive goods twice.
 */
export async function confirmReceipt(organizationId: string, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM receipts WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    if (!row) throw notFound("Receipt");
    if (row.status !== "draft") throw new HttpError(409, "RECEIPT_CONFIRMED", "This receipt has already been confirmed.");
    const receipt = await tx.receipt.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, supplier: true } });
    const label = `Receipt ${receipt.reference ?? id.slice(0, 8)}${receipt.supplier ? ` from ${receipt.supplier.name}` : ""}`;
    for (const line of receipt.lines) {
      if (!line.productId) continue;
      const usable = line.receivedQuantity - line.damagedQuantity;
      if (usable > 0) {
        await applyWithin(tx, organizationId, userId, {
          productId: line.productId,
          operation: { type: "receive", quantity: usable },
          source: "receiving",
          note: label.slice(0, 200),
          reference: { type: "receipt", id },
        });
      }
      if (line.updateCost && line.unitCost !== null) {
        const before = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        const after = await tx.product.update({ where: { id: line.productId }, data: { costPrice: line.unitCost, lastUpdatedById: userId } });
        await recordFieldChanges(tx, organizationId, line.productId, fieldValues(before), fieldValues(after), userId, () => ({
          source: "receipt",
          status: "documented",
          detail: label.slice(0, 200),
          reference: { type: "receipt", id },
        }));
      }
    }
    await tx.receipt.update({ where: { id }, data: { status: "confirmed", confirmedAt: new Date(), confirmedById: userId } });
  });
  return getReceipt(organizationId, id);
}

/** Reads an invoice's text and proposes matches; nothing is saved. */
export async function analyseInvoiceText(organizationId: string, text: string) {
  const parsed = parseInvoiceText(text);
  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, sku: true, brand: true, quantityOnHand: true, costPrice: true, barcodes: { select: { code: true } } },
    }),
    prisma.supplier.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  const candidates = products.map((p) => ({ ...p, barcodes: p.barcodes.map((b) => b.code) }));
  const supplierMatch = parsed.supplier
    ? suppliers
        .map((sup) => ({ sup, score: similarity(parsed.supplier ?? "", sup.name) }))
        .filter((m) => m.score >= 0.6)
        .sort((x, y) => y.score - x.score)[0] ?? null
    : null;
  return {
    ...parsed,
    supplierMatch: supplierMatch ? { id: supplierMatch.sup.id, name: supplierMatch.sup.name, confidence: supplierMatch.score >= 0.8 ? "high" : "medium" } : null,
    lines: parsed.lines.map((line) => {
      const matches = rankMatches(line.description, candidates, 3);
      return {
        ...line,
        matches: matches.map((m) => ({
          productId: m.product.id,
          name: m.product.name,
          sku: m.product.sku,
          currentCost: m.product.costPrice?.toFixed(2) ?? null,
          confidence: m.confidence,
          reason: m.reason,
        })),
      };
    }),
  };
}
