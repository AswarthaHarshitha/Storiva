import type { Prisma, StockMovementSource, StockMovementType } from "@prisma/client";

export interface MovementInput {
  organizationId: string;
  product: { id: string; sku: string; name: string };
  type: StockMovementType;
  source: StockMovementSource;
  quantityBefore: number;
  quantityAfter: number;
  userId: string;
  note?: string | null;
  idempotencyKey?: string | null;
  reference?: { type: string; id: string } | null;
}

/** Appends a ledger entry. Always called inside the transaction that changed the quantity. */
export function recordMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  return tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      productId: input.product.id,
      productSku: input.product.sku,
      productName: input.product.name,
      type: input.type,
      source: input.source,
      quantityBefore: input.quantityBefore,
      quantityChange: input.quantityAfter - input.quantityBefore,
      quantityAfter: input.quantityAfter,
      userId: input.userId,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      referenceType: input.reference?.type ?? null,
      referenceId: input.reference?.id ?? null,
    },
  });
}
