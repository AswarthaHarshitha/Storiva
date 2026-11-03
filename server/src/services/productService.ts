import { Prisma, type Product } from "@prisma/client";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isRecordNotFound, isUniqueViolation } from "../lib/prismaErrors.js";
import type { ProductInput } from "../validation/product.js";

// Every function here takes the caller's organizationId and includes it in each query's
// WHERE clause. A product belonging to another organization is indistinguishable from one
// that does not exist, so cross-tenant requests get a 404 rather than confirming the ID.

const skuTaken = () =>
  new HttpError(409, "SKU_TAKEN", "Another product already uses this SKU.", {
    sku: "Another product in your inventory already uses this SKU.",
  });

const productNotFound = () => notFound("Product");

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
  createdAt: Date;
  updatedAt: Date;
}

type ProductRow = Product & { lastUpdatedBy: { email: string } | null };

const withUpdater = { lastUpdatedBy: { select: { email: true } } } as const;

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
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }
  const [products, defaultThreshold] = await Promise.all([
    prisma.product.findMany({ where, include: withUpdater, orderBy: [{ name: "asc" }, { sku: "asc" }] }),
    defaultThresholdOf(organizationId),
  ]);
  return products.map((product) => toView(product, defaultThreshold));
}

export async function getProduct(organizationId: string, id: string): Promise<ProductView> {
  const [product, defaultThreshold] = await Promise.all([
    prisma.product.findFirst({ where: { id, organizationId }, include: withUpdater }),
    defaultThresholdOf(organizationId),
  ]);
  if (!product) throw productNotFound();
  return toView(product, defaultThreshold);
}

export async function createProduct(organizationId: string, userId: string, input: ProductInput): Promise<ProductView> {
  try {
    const product = await prisma.product.create({
      data: { ...toData(input), organizationId, lastUpdatedById: userId },
      include: withUpdater,
    });
    return toView(product, await defaultThresholdOf(organizationId));
  } catch (error) {
    if (isUniqueViolation(error)) throw skuTaken();
    throw error;
  }
}

export async function updateProduct(
  organizationId: string,
  userId: string,
  id: string,
  input: ProductInput,
): Promise<ProductView> {
  try {
    const product = await prisma.product.update({
      where: { id, organizationId },
      data: { ...toData(input), lastUpdatedById: userId },
      include: withUpdater,
    });
    return toView(product, await defaultThresholdOf(organizationId));
  } catch (error) {
    if (isRecordNotFound(error)) throw productNotFound();
    if (isUniqueViolation(error)) throw skuTaken();
    throw error;
  }
}

/**
 * Adds or removes units in one conditional UPDATE, so two concurrent adjustments can never
 * take stock below zero or overwrite each other.
 */
export async function adjustStock(
  organizationId: string,
  userId: string,
  id: string,
  adjustment: { delta: number; note: string | null },
): Promise<ProductView> {
  const { count } = await prisma.product.updateMany({
    where: { id, organizationId, quantityOnHand: { gte: -adjustment.delta } },
    data: {
      quantityOnHand: { increment: adjustment.delta },
      lastAdjustmentNote: adjustment.note,
      lastUpdatedById: userId,
    },
  });
  if (count === 0) {
    const product = await prisma.product.findFirst({ where: { id, organizationId }, select: { quantityOnHand: true } });
    if (!product) throw productNotFound();
    throw new HttpError(422, "INSUFFICIENT_STOCK", "Stock cannot go below zero.", {
      delta: `Only ${product.quantityOnHand} units are on hand.`,
    });
  }
  return getProduct(organizationId, id);
}

export async function deleteProduct(organizationId: string, id: string): Promise<void> {
  const { count } = await prisma.product.deleteMany({ where: { id, organizationId } });
  if (count === 0) throw productNotFound();
}
