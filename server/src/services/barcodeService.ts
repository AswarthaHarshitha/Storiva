import { normalizeBarcode } from "../lib/barcode.js";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prismaErrors.js";
import { barcodeTaken, getProduct, type ProductView } from "./productService.js";

export interface BarcodeLookup {
  code: string;
  kind: "gtin" | "other";
  /** How the product was identified: a registered barcode, or a code equal to its SKU. */
  matchedBy: "barcode" | "sku" | null;
  product: ProductView | null;
}

function normalizeOrThrow(raw: string, format?: string) {
  const normalized = normalizeBarcode(raw, format);
  if (!normalized.ok) throw new HttpError(422, "INVALID_BARCODE", normalized.error, { code: normalized.error });
  return normalized;
}

/** Finds the product a scanned code belongs to, searching only the caller's organization. */
export async function lookupBarcode(organizationId: string, raw: string, format?: string): Promise<BarcodeLookup> {
  const { code, kind } = normalizeOrThrow(raw, format);

  const barcode = await prisma.productBarcode.findUnique({
    where: { organizationId_code: { organizationId, code } },
    select: { productId: true },
  });
  if (barcode) return { code, kind, matchedBy: "barcode", product: await getProduct(organizationId, barcode.productId) };

  const bySku = await prisma.product.findFirst({
    where: { organizationId, sku: { equals: code, mode: "insensitive" } },
    select: { id: true },
  });
  if (bySku) return { code, kind, matchedBy: "sku", product: await getProduct(organizationId, bySku.id) };

  return { code, kind, matchedBy: null, product: null };
}

export async function attachBarcode(
  organizationId: string,
  userId: string,
  productId: string,
  raw: string,
  format?: string,
): Promise<ProductView> {
  const { code, kind } = normalizeOrThrow(raw, format);
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!product) throw notFound("Product");

  const existing = await prisma.productBarcode.findUnique({
    where: { organizationId_code: { organizationId, code } },
    select: { productId: true, product: { select: { name: true, sku: true } } },
  });
  if (existing?.productId === productId) return getProduct(organizationId, productId);
  if (existing) throw barcodeTaken(existing.product);

  try {
    await prisma.productBarcode.create({
      data: { organizationId, productId, code, rawCode: raw.trim(), kind, createdById: userId },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw barcodeTaken();
    throw error;
  }
  return getProduct(organizationId, productId);
}

export async function removeBarcode(organizationId: string, productId: string, barcodeId: string): Promise<ProductView> {
  const { count } = await prisma.productBarcode.deleteMany({ where: { id: barcodeId, productId, organizationId } });
  if (count === 0) throw notFound("Barcode");
  return getProduct(organizationId, productId);
}
