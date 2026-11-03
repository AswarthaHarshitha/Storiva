import { Prisma, type Product } from "@prisma/client";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isRecordNotFound, isUniqueViolation } from "../lib/prismaErrors.js";
import { normalizeBarcode } from "../lib/barcode.js";
import type { ProductInput } from "../validation/product.js";
import { recordMovement } from "./stockLedger.js";

// Every function here takes the caller's organizationId and includes it in each query's
// WHERE clause. A product belonging to another organization is indistinguishable from one
// that does not exist, so cross-tenant requests get a 404 rather than confirming the ID.

const skuTaken = () =>
  new HttpError(409, "SKU_TAKEN", "Another product already uses this SKU.", {
    sku: "Another product in your inventory already uses this SKU.",
  });

const productNotFound = () => notFound("Product");

export interface ProductBarcodeView {
  id: string;
  code: string;
  kind: "gtin" | "other";
}

export interface ProductView {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  quantityOnHand: number;
  costPrice: string | null;
  sellingPrice: string | null;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
  isLowStock: boolean;
  lastAdjustmentNote: string | null;
  lastUpdatedBy: string | null;
  barcodes: ProductBarcodeView[];
  createdAt: Date;
  updatedAt: Date;
}

type ProductRow = Product & {
  lastUpdatedBy: { email: string } | null;
  barcodes: { id: string; code: string; kind: "gtin" | "other" }[];
};

const productInclude = {
  lastUpdatedBy: { select: { email: true } },
  barcodes: { select: { id: true, code: true, kind: true }, orderBy: { createdAt: "asc" } },
} as const;

const toView = (product: ProductRow, defaultThreshold: number): ProductView => {
  const effectiveThreshold = product.lowStockThreshold ?? defaultThreshold;
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    quantityOnHand: product.quantityOnHand,
    costPrice: product.costPrice?.toFixed(2) ?? null,
    sellingPrice: product.sellingPrice?.toFixed(2) ?? null,
    lowStockThreshold: product.lowStockThreshold,
    effectiveThreshold,
    isLowStock: product.quantityOnHand <= effectiveThreshold,
    lastAdjustmentNote: product.lastAdjustmentNote,
    lastUpdatedBy: product.lastUpdatedBy?.email ?? null,
    barcodes: product.barcodes,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

async function defaultThresholdOf(organizationId: string): Promise<number> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { defaultLowStockThreshold: true },
  });
  return organization.defaultLowStockThreshold;
}

const toData = (input: ProductInput) => ({
  name: input.name,
  sku: input.sku,
  description: input.description,
  quantityOnHand: input.quantityOnHand,
  costPrice: input.costPrice === null ? null : new Prisma.Decimal(input.costPrice),
  sellingPrice: input.sellingPrice === null ? null : new Prisma.Decimal(input.sellingPrice),
  lowStockThreshold: input.lowStockThreshold,
});

export async function listProducts(organizationId: string, search?: string): Promise<ProductView[]> {
  const where: Prisma.ProductWhereInput = { organizationId };
  if (search) {
    // A search can also be a scanned code, so exact barcode matches are included.
    const normalized = normalizeBarcode(search);
    const codes = normalized.ok ? [...new Set([search, normalized.code])] : [search];
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcodes: { some: { organizationId, code: { in: codes } } } },
    ];
  }
  const [products, defaultThreshold] = await Promise.all([
    prisma.product.findMany({ where, include: productInclude, orderBy: [{ name: "asc" }, { sku: "asc" }] }),
    defaultThresholdOf(organizationId),
  ]);
  return products.map((product) => toView(product, defaultThreshold));
}

export async function getProduct(organizationId: string, id: string): Promise<ProductView> {
  const [product, defaultThreshold] = await Promise.all([
    prisma.product.findFirst({ where: { id, organizationId }, include: productInclude }),
    defaultThresholdOf(organizationId),
  ]);
  if (!product) throw productNotFound();
  return toView(product, defaultThreshold);
}

export async function createProduct(organizationId: string, userId: string, input: ProductInput): Promise<ProductView> {
  const barcodes = normalizeAll(input.barcodes ?? []);
  try {
    const created = await prisma.$transaction(async (tx) => {
      await assertBarcodesFree(tx, organizationId, barcodes);
      const product = await tx.product.create({
        data: {
          ...toData(input),
          organizationId,
          lastUpdatedById: userId,
          barcodes: {
            create: barcodes.map((b) => ({ organizationId, code: b.code, rawCode: b.raw, kind: b.kind, createdById: userId })),
          },
        },
      });
      await recordMovement(tx, {
        organizationId,
        product,
        type: "create",
        source: "manual",
        quantityBefore: 0,
        quantityAfter: product.quantityOnHand,
        userId,
      });
      return product;
    });
    return await getProduct(organizationId, created.id);
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

export async function updateProduct(
  organizationId: string,
  userId: string,
  id: string,
  input: ProductInput,
): Promise<ProductView> {
  try {
    await prisma.$transaction(async (tx) => {
      const before = await lockProduct(tx, organizationId, id);
      const product = await tx.product.update({
        where: { id, organizationId },
        data: { ...toData(input), lastUpdatedById: userId },
      });
      if (product.quantityOnHand !== before.quantity) {
        await recordMovement(tx, {
          organizationId,
          product,
          type: "edit",
          source: "manual",
          quantityBefore: before.quantity,
          quantityAfter: product.quantityOnHand,
          userId,
        });
      }
    });
    return await getProduct(organizationId, id);
  } catch (error) {
    if (isRecordNotFound(error)) throw productNotFound();
    throw translateUniqueViolation(error);
  }
}

/**
 * Adds or removes units. The row is locked for the duration of the transaction, so concurrent
 * adjustments are applied one after another and can never take stock below zero.
 */
export async function adjustStock(
  organizationId: string,
  userId: string,
  id: string,
  adjustment: { delta: number; note: string | null },
): Promise<ProductView> {
  await prisma.$transaction(async (tx) => {
    const before = await lockProduct(tx, organizationId, id);
    const after = before.quantity + adjustment.delta;
    if (after < 0) {
      throw new HttpError(422, "INSUFFICIENT_STOCK", "Stock cannot go below zero.", {
        delta: `Only ${before.quantity} units are on hand.`,
      });
    }
    await tx.product.update({
      where: { id },
      data: { quantityOnHand: after, lastAdjustmentNote: adjustment.note, lastUpdatedById: userId },
    });
    await recordMovement(tx, {
      organizationId,
      product: before,
      type: "adjust",
      source: "manual",
      quantityBefore: before.quantity,
      quantityAfter: after,
      userId,
      note: adjustment.note,
    });
  });
  return getProduct(organizationId, id);
}

export async function deleteProduct(organizationId: string, id: string): Promise<void> {
  const { count } = await prisma.product.deleteMany({ where: { id, organizationId } });
  if (count === 0) throw productNotFound();
}

async function lockProduct(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const [row] = await tx.$queryRaw<{ id: string; sku: string; name: string; quantity: number }[]>`
    SELECT id, sku, name, quantity_on_hand AS quantity
      FROM products
     WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
       FOR UPDATE`;
  if (!row) throw productNotFound();
  return row;
}

interface PendingBarcode {
  raw: string;
  code: string;
  kind: "gtin" | "other";
}

function normalizeAll(raws: string[]): PendingBarcode[] {
  const result: PendingBarcode[] = [];
  for (const [index, raw] of raws.entries()) {
    const normalized = normalizeBarcode(raw);
    if (!normalized.ok) {
      throw new HttpError(422, "VALIDATION_FAILED", "Some fields need attention.", { [`barcodes.${index}`]: normalized.error });
    }
    if (!result.some((b) => b.code === normalized.code)) result.push({ raw: raw.trim(), code: normalized.code, kind: normalized.kind });
  }
  return result;
}

async function assertBarcodesFree(tx: Prisma.TransactionClient, organizationId: string, barcodes: PendingBarcode[]) {
  if (barcodes.length === 0) return;
  const taken = await tx.productBarcode.findFirst({
    where: { organizationId, code: { in: barcodes.map((b) => b.code) } },
    select: { code: true, product: { select: { name: true, sku: true } } },
  });
  if (taken) throw barcodeTaken(taken.product);
}

export const barcodeTaken = (owner?: { name: string; sku: string }) =>
  new HttpError(409, "BARCODE_TAKEN", "This barcode is already assigned to a product.", {
    barcode: owner
      ? `This barcode is already assigned to ${owner.name} (${owner.sku}).`
      : "This barcode is already assigned to another product.",
  });

/** Maps a unique-constraint failure to the field it concerns (barcode or SKU). */
function translateUniqueViolation(error: unknown): unknown {
  if (!isUniqueViolation(error)) return error;
  const target = JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta?.target ?? "");
  return target.includes("code") ? barcodeTaken() : skuTaken();
}
