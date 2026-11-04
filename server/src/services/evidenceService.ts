import type { EvidenceStatus, Prisma } from "@prisma/client";
import { normalizeBarcode } from "../lib/barcode.js";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/** The product fields whose origin is tracked. Quantity's origin comes from the stock ledger. */
export const TRACKED_FIELDS = {
  name: "Name",
  brand: "Brand",
  manufacturer: "Manufacturer",
  category: "Category",
  description: "Description",
  costPrice: "Cost price",
  sellingPrice: "Selling price",
} as const;
export type TrackedField = keyof typeof TRACKED_FIELDS;

type FieldValues = Partial<Record<TrackedField, string | null>>;

export interface EvidenceOrigin {
  source: string;
  status: EvidenceStatus;
  detail?: string | null;
  reference?: { type: string; id: string } | null;
}

export function fieldValues(product: {
  name: string;
  brand: string | null;
  manufacturer: string | null;
  category: string | null;
  description: string | null;
  costPrice: Prisma.Decimal | null;
  sellingPrice: Prisma.Decimal | null;
}): FieldValues {
  return {
    name: product.name,
    brand: product.brand,
    manufacturer: product.manufacturer,
    category: product.category,
    description: product.description,
    costPrice: product.costPrice?.toFixed(2) ?? null,
    sellingPrice: product.sellingPrice?.toFixed(2) ?? null,
  };
}

/**
 * Records the origin of every tracked field whose value is new or changed. `originFor` decides
 * the origin per field, so one save can mix sources (e.g. a catalogue name and a typed price).
 */
export async function recordFieldChanges(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
  before: FieldValues | null,
  after: FieldValues,
  userId: string,
  originFor: (field: TrackedField) => EvidenceOrigin,
) {
  const rows: Prisma.ProductEvidenceCreateManyInput[] = [];
  for (const field of Object.keys(TRACKED_FIELDS) as TrackedField[]) {
    const value = after[field] ?? null;
    if (before ? before[field] === value : value === null) continue;
    const origin = originFor(field);
    rows.push({
      organizationId,
      productId,
      field,
      value: value?.slice(0, 500) ?? null,
      source: origin.source,
      status: origin.status,
      detail: origin.detail ?? null,
      referenceType: origin.reference?.type ?? null,
      referenceId: origin.reference?.id ?? null,
      userId,
    });
  }
  if (rows.length > 0) await tx.productEvidence.createMany({ data: rows });
}

/**
 * For a product created from a catalogue result: which saved values are exactly what the
 * catalogue returned (recorded as unverified catalogue data) and which the person changed
 * (recorded as entered). Compared against the cached catalogue answer, not the client's word.
 */
export async function catalogueOriginFor(
  tx: Prisma.TransactionClient,
  provider: string,
  sourceName: string,
  barcode: string | undefined,
  saved: FieldValues,
): Promise<(field: TrackedField) => EvidenceOrigin> {
  const normalized = barcode ? normalizeBarcode(barcode) : null;
  const entry =
    normalized?.ok && normalized.kind === "gtin"
      ? await tx.catalogueEntry.findUnique({ where: { provider_code: { provider, code: normalized.code } } })
      : null;
  const data = (entry?.found ? entry.data : null) as Record<string, string | null> | null;
  return (field) =>
    data && field !== "costPrice" && field !== "sellingPrice" && data[field] !== undefined && data[field] === (saved[field] ?? null)
      ? { source: "catalogue", status: "unverified", detail: sourceName }
      : { source: "manual", status: "entered" };
}

export async function getEvidence(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: {
      quantityOnHand: true,
      name: true,
      brand: true,
      manufacturer: true,
      category: true,
      description: true,
      costPrice: true,
      sellingPrice: true,
    },
  });
  if (!product) throw notFound("Product");

  const [rows, lastCount, firstMovement] = await Promise.all([
    prisma.productEvidence.findMany({
      where: { organizationId, productId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { user: { select: { email: true } } },
    }),
    prisma.stockMovement.findFirst({
      where: { organizationId, productId, type: "count" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.stockMovement.findFirst({ where: { organizationId, productId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const changesSinceCount = await prisma.stockMovement.count({
    where: { organizationId, productId, quantityChange: { not: 0 }, ...(lastCount ? { createdAt: { gt: lastCount.createdAt } } : {}) },
  });

  const current = fieldValues(product);
  const fields = (Object.keys(TRACKED_FIELDS) as TrackedField[]).map((field) => {
    const history = rows.filter((r) => r.field === field).slice(0, 5);
    const latest = history[0];
    return {
      field,
      label: TRACKED_FIELDS[field],
      value: current[field] ?? null,
      // If the newest record no longer matches the value, the field changed in a way that was not
      // recorded (e.g. before evidence tracking existed), so its origin is shown as unknown.
      origin: latest && latest.value === (current[field] ?? null) ? toView(latest) : null,
      history: history.map(toView),
    };
  });

  return {
    fields,
    quantity: {
      value: product.quantityOnHand,
      lastCount: lastCount
        ? { date: lastCount.createdAt, quantity: lastCount.quantityAfter, difference: lastCount.quantityChange, by: lastCount.user?.email ?? null }
        : null,
      changesSinceCount,
      historyStartsAt: firstMovement?.createdAt ?? null,
    },
  };
}

function toView(row: { source: string; status: EvidenceStatus; detail: string | null; value: string | null; referenceType: string | null; referenceId: string | null; createdAt: Date; user: { email: string } | null }) {
  return {
    value: row.value,
    source: row.source,
    status: row.status,
    detail: row.detail,
    reference: row.referenceType && row.referenceId ? { type: row.referenceType, id: row.referenceId } : null,
    recordedAt: row.createdAt,
    by: row.user?.email ?? null,
  };
}

/** A person confirms a field's current value, e.g. after checking the price tag. */
export async function verifyField(organizationId: string, userId: string, productId: string, field: string) {
  if (!(field in TRACKED_FIELDS)) throw new HttpError(422, "VALIDATION_FAILED", "Unknown field.", { field: "Unknown field." });
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw notFound("Product");
  const value = fieldValues(product)[field as TrackedField] ?? null;
  if (value === null) throw new HttpError(422, "VALIDATION_FAILED", "There is no value to confirm.", { field: "There is no value to confirm." });
  await prisma.productEvidence.create({
    data: { organizationId, productId, field, value, source: "manual_check", status: "verified", userId },
  });
  return getEvidence(organizationId, productId);
}
