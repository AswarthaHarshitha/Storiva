import type { StockMovement, StockMovementSource } from "@prisma/client";
import { HttpError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prismaErrors.js";
import { getProduct, type ProductView } from "./productService.js";
import { recordMovement } from "./stockLedger.js";

export type StockOperation =
  | { type: "receive" | "issue"; quantity: number }
  | { type: "count"; countedQuantity: number; expectedQuantity: number };

export interface StockOperationInput {
  productId: string;
  operation: StockOperation;
  source: StockMovementSource;
  note: string | null;
  idempotencyKey: string;
}

export interface StockOperationResult {
  movement: MovementView;
  product: ProductView;
  /** True when this request repeated an idempotency key that had already been applied. */
  replayed: boolean;
}

export interface MovementView {
  id: string;
  type: StockMovement["type"];
  source: StockMovement["source"];
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  note: string | null;
  user: string | null;
  createdAt: Date;
}

const toMovementView = (m: StockMovement & { user: { email: string } | null }): MovementView => ({
  id: m.id,
  type: m.type,
  source: m.source,
  quantityBefore: m.quantityBefore,
  quantityChange: m.quantityChange,
  quantityAfter: m.quantityAfter,
  note: m.note,
  user: m.user?.email ?? null,
  createdAt: m.createdAt,
});

const withUser = { user: { select: { email: true } } } as const;

async function replay(organizationId: string, idempotencyKey: string, productId: string): Promise<StockOperationResult | null> {
  const movement = await prisma.stockMovement.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    include: withUser,
  });
  if (!movement) return null;
  if (movement.productId !== productId) {
    throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for a different product.");
  }
  return { movement: toMovementView(movement), product: await getProduct(organizationId, productId), replayed: true };
}

interface LockedProduct {
  id: string;
  sku: string;
  name: string;
  quantity: number;
}

/**
 * Applies receive, issue or count to one product of the caller's organization and records it in
 * the ledger, all in one transaction. The quantity change and the ledger row commit together or
 * not at all.
 */
export async function applyStockOperation(
  organizationId: string,
  userId: string,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  const earlier = await replay(organizationId, input.idempotencyKey, input.productId);
  if (earlier) return earlier;

  try {
    const movement = await prisma.$transaction(async (tx) => {
      // Lock the row so the before/after values in the ledger are exact even under concurrency.
      const [row] = await tx.$queryRaw<LockedProduct[]>`
        SELECT id, sku, name, quantity_on_hand AS quantity
          FROM products
         WHERE id = ${input.productId}::uuid AND organization_id = ${organizationId}::uuid
           FOR UPDATE`;
      if (!row) throw notFound("Product");

      const before = row.quantity;
      const after = resultingQuantity(before, input.operation);

      await tx.product.update({
        where: { id: row.id },
        data: {
          quantityOnHand: after,
          lastUpdatedById: userId,
          ...(input.note !== null ? { lastAdjustmentNote: input.note } : {}),
        },
      });
      return recordMovement(tx, {
        organizationId,
        product: row,
        type: input.operation.type,
        source: input.source,
        quantityBefore: before,
        quantityAfter: after,
        userId,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
      });
    });
    const full = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, include: withUser });
    return { movement: toMovementView(full), product: await getProduct(organizationId, input.productId), replayed: false };
  } catch (error) {
    // Two identical requests raced: the other one committed first and this one rolled back.
    if (isUniqueViolation(error)) {
      const winner = await replay(organizationId, input.idempotencyKey, input.productId);
      if (winner) return winner;
    }
    throw error;
  }
}

function resultingQuantity(before: number, operation: StockOperation): number {
  switch (operation.type) {
    case "receive":
      return before + operation.quantity;
    case "issue":
      if (operation.quantity > before) {
        throw new HttpError(422, "INSUFFICIENT_STOCK", "Stock cannot go below zero.", {
          quantity: `Only ${before} ${before === 1 ? "unit is" : "units are"} on hand.`,
        });
      }
      return before - operation.quantity;
    case "count":
      if (operation.expectedQuantity !== before) {
        // Someone changed the stock after the counter looked at it. Applying the count now would
        // silently discard that change, so the counter must confirm against the new figure.
        throw new HttpError(
          409,
          "QUANTITY_CHANGED",
          `The system quantity changed from ${operation.expectedQuantity} to ${before} while you were counting. Check the count against the new figure.`,
          { expectedQuantity: String(before) },
        );
      }
      return operation.countedQuantity;
  }
}

export async function listMovements(organizationId: string, productId: string, limit: number): Promise<MovementView[]> {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!product) throw notFound("Product");
  const movements = await prisma.stockMovement.findMany({
    where: { organizationId, productId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: withUser,
  });
  return movements.map(toMovementView);
}

