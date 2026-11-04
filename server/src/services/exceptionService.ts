import type { Prisma } from "@prisma/client";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;

export type ExceptionType =
  | "count_discrepancy"
  | "unusual_adjustment"
  | "never_counted"
  | "incomplete_pricing"
  | "barcode_unidentified"
  | "import_errors"
  | "receipt_discrepancy"
  | "sync_failure";

interface Finding {
  type: ExceptionType;
  dedupeKey: string;
  productId?: string | null;
  title: string;
  detail: Prisma.InputJsonValue;
}

/** A correction is "unusual" if it moves at least this many units, or half the stock. */
export const UNUSUAL_ADJUSTMENT = { minUnits: 10, share: 0.5 } as const;

export const isUnusualAdjustment = (before: number, change: number) =>
  Math.abs(change) >= UNUSUAL_ADJUSTMENT.minUnits || (before > 0 && Math.abs(change) >= before * UNUSUAL_ADJUSTMENT.share && Math.abs(change) >= 3);

async function upsertFindings(organizationId: string, findings: Finding[]) {
  for (const f of findings) {
    await prisma.inventoryException.upsert({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey: f.dedupeKey } },
      create: { organizationId, type: f.type, dedupeKey: f.dedupeKey, productId: f.productId ?? null, title: f.title, detail: f.detail },
      // Grouped findings keep their figures current; resolved ones stay resolved.
      update: { title: f.title, detail: f.detail },
    });
  }
}

async function autoResolve(organizationId: string, ids: string[], note: string) {
  if (ids.length === 0) return;
  await prisma.inventoryException.updateMany({
    where: { organizationId, id: { in: ids }, status: "open" },
    data: { status: "resolved", resolutionNote: note, resolvedAt: new Date() },
  });
}

/** Re-checks the organization's data and records any new findings. Deterministic rules only. */
export async function detectExceptions(organizationId: string, now = new Date()) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const findings: Finding[] = [];

  const movements = await prisma.stockMovement.findMany({
    where: { organizationId, productId: { not: null }, createdAt: { gte: since } },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const lastCountAt = new Map<string, Date>();
  for (const m of movements) if (m.type === "count" && m.productId) lastCountAt.set(m.productId, m.createdAt);

  for (const m of movements) {
    if (!m.productId) continue;
    const evidence = {
      movementId: m.id,
      date: m.createdAt.toISOString(),
      before: m.quantityBefore,
      change: m.quantityChange,
      after: m.quantityAfter,
      by: m.user?.email ?? null,
      note: m.note,
      sku: m.productSku,
    };
    if (m.type === "count" && m.quantityChange !== 0) {
      findings.push({
        type: "count_discrepancy",
        dedupeKey: `count:${m.id}`,
        productId: m.productId,
        title: `Count of ${m.productName} differed by ${m.quantityChange > 0 ? "+" : ""}${m.quantityChange}`,
        detail: { ...evidence, recommendation: "Recount the product. If the count is confirmed, resolve this with a note on the likely cause." },
      });
    }
    if ((m.type === "adjust" || m.type === "edit") && m.quantityChange !== 0 && isUnusualAdjustment(m.quantityBefore, m.quantityChange)) {
      findings.push({
        type: "unusual_adjustment",
        dedupeKey: `adjust:${m.id}`,
        productId: m.productId,
        title: `Large manual correction to ${m.productName}: ${m.quantityChange > 0 ? "+" : ""}${m.quantityChange}`,
        detail: {
          ...evidence,
          rule: `At least ${UNUSUAL_ADJUSTMENT.minUnits} units, or half the stock, changed by hand.`,
          recommendation: "Check that the correction was intended; count the product if in doubt.",
        },
      });
    }
  }

  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, name: true, sku: true, quantityOnHand: true, costPrice: true, sellingPrice: true },
  });
  const counted = new Set(
    (await prisma.stockMovement.findMany({ where: { organizationId, type: "count" }, select: { productId: true }, distinct: ["productId"] }))
      .map((m) => m.productId)
      .filter(Boolean),
  );
  const neverCounted = products.filter((p) => p.quantityOnHand > 0 && !counted.has(p.id));
  const unpriced = products.filter((p) => p.costPrice === null || p.sellingPrice === null);
  const grouped: [ExceptionType, string, typeof products, string, string][] = [
    ["never_counted", "never-counted", neverCounted, "never been physically counted", "Use the Trust Radar's verification queue to count the products holding the most stock first."],
    ["incomplete_pricing", "incomplete-pricing", unpriced, "missing a cost or selling price", "Add the missing prices so stock value and margins can be calculated."],
  ];
  const groupedKeysToClose: string[] = [];
  for (const [type, key, list, what, recommendation] of grouped) {
    if (list.length === 0) {
      groupedKeysToClose.push(key);
      continue;
    }
    findings.push({
      type,
      dedupeKey: key,
      title: `${list.length} ${list.length === 1 ? "product has" : "products have"} ${what}`,
      detail: { count: list.length, examples: list.slice(0, 8).map((p) => ({ id: p.id, name: p.name, sku: p.sku })), recommendation },
    });
  }

  const imports = await prisma.importBatch.findMany({ where: { organizationId, skippedCount: { gt: 0 }, createdAt: { gte: since } } });
  for (const b of imports) {
    findings.push({
      type: "import_errors",
      dedupeKey: `import:${b.id}`,
      title: `${b.skippedCount} ${b.skippedCount === 1 ? "row was" : "rows were"} left out of the import of ${b.fileName}`,
      detail: { importId: b.id, errors: b.errors, recommendation: "Correct the listed rows in the file and import them again." },
    });
  }

  const receipts = await prisma.receipt.findMany({
    where: { organizationId, status: "confirmed", confirmedAt: { gte: since } },
    include: { lines: { include: { product: { select: { name: true } } } }, supplier: { select: { name: true } } },
  });
  for (const r of receipts) {
    const issues = r.lines.flatMap((l) => {
      const out: string[] = [];
      if (l.expectedQuantity !== null && l.expectedQuantity !== l.receivedQuantity) out.push(`${l.description}: expected ${l.expectedQuantity}, received ${l.receivedQuantity}`);
      if (l.damagedQuantity > 0) out.push(`${l.description}: ${l.damagedQuantity} damaged`);
      if (!l.productId && l.receivedQuantity > 0) out.push(`${l.description}: not matched to a product, so not added to stock`);
      return out;
    });
    if (issues.length > 0) {
      findings.push({
        type: "receipt_discrepancy",
        dedupeKey: `receipt:${r.id}`,
        title: `Receipt ${r.reference ?? "without reference"}${r.supplier ? ` from ${r.supplier.name}` : ""} has ${issues.length} ${issues.length === 1 ? "discrepancy" : "discrepancies"}`,
        detail: { receiptId: r.id, issues, recommendation: "Contact the supplier about missing or damaged goods, and match any unmatched lines." },
      });
    }
  }

  await upsertFindings(organizationId, findings);

  // Close findings whose cause has gone away.
  const open = await prisma.inventoryException.findMany({ where: { organizationId, status: "open" } });
  const recounted = open.filter((e) => {
    if (e.type !== "count_discrepancy" || !e.productId) return false;
    const date = (e.detail as { date?: string }).date;
    const latest = lastCountAt.get(e.productId);
    return Boolean(date && latest && latest.getTime() > new Date(date).getTime());
  });
  await autoResolve(organizationId, recounted.map((e) => e.id), "Resolved automatically: the product was counted again.");
  await autoResolve(organizationId, open.filter((e) => groupedKeysToClose.includes(e.dedupeKey)).map((e) => e.id), "Resolved automatically: no products are affected any more.");
  const unknownCodes = open.filter((e) => e.type === "barcode_unidentified");
  if (unknownCodes.length > 0) {
    const codes = unknownCodes.map((e) => (e.detail as { code: string }).code);
    const registered = new Set((await prisma.productBarcode.findMany({ where: { organizationId, code: { in: codes } }, select: { code: true } })).map((b) => b.code));
    await autoResolve(organizationId, unknownCodes.filter((e) => registered.has((e.detail as { code: string }).code)).map((e) => e.id), "Resolved automatically: the barcode now belongs to a product.");
  }
}

export async function listExceptions(organizationId: string, status: "open" | "closed") {
  await detectExceptions(organizationId);
  const rows = await prisma.inventoryException.findMany({
    where: { organizationId, status: status === "open" ? "open" : { in: ["resolved", "dismissed"] } },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  const counts = await prisma.inventoryException.groupBy({ by: ["type"], where: { organizationId, status: "open" }, _count: { _all: true } });
  return {
    exceptions: rows.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      status: e.status,
      product: e.product,
      resolutionNote: e.resolutionNote,
      resolvedAt: e.resolvedAt,
      createdAt: e.createdAt,
    })),
    openByType: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
  };
}

export async function resolveException(organizationId: string, userId: string, id: string, status: "resolved" | "dismissed", note: string) {
  const { count } = await prisma.inventoryException.updateMany({
    where: { id, organizationId, status: "open" },
    data: { status, resolutionNote: note, resolvedById: userId, resolvedAt: new Date() },
  });
  if (count === 0) {
    const exists = await prisma.inventoryException.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!exists) throw notFound("Exception");
    throw new HttpError(409, "ALREADY_CLOSED", "This exception has already been closed.");
  }
}

/** Called when a scanned barcode could not be identified in the inventory or any catalogue. */
export async function recordUnidentifiedBarcode(organizationId: string, code: string, catalogueChecked: boolean) {
  await upsertFindings(organizationId, [
    {
      type: "barcode_unidentified",
      dedupeKey: `barcode:${code}`,
      title: `Barcode ${code} could not be identified`,
      detail: {
        code,
        catalogueChecked,
        lastSeen: new Date().toISOString(),
        recommendation: "Add the product with this barcode, or attach the barcode to an existing product.",
      },
    },
  ]);
}

/** Called by a client whose offline operation was refused when it synchronized. */
export async function recordSyncFailure(
  organizationId: string,
  failure: { idempotencyKey: string; productId: string | null; productName: string; operation: string; error: string; queuedAt: string },
) {
  const product = failure.productId
    ? await prisma.product.findFirst({ where: { id: failure.productId, organizationId }, select: { id: true } })
    : null;
  await upsertFindings(organizationId, [
    {
      type: "sync_failure",
      dedupeKey: `sync:${failure.idempotencyKey}`,
      productId: product?.id ?? null,
      title: `Offline ${failure.operation} for ${failure.productName} could not be applied`,
      detail: { ...failure, recommendation: "Check the product's current quantity and redo the operation if it is still needed." },
    },
  ]);
}
