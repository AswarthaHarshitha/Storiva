import type { Request, Response } from "express";
import { notFound } from "../lib/errors.js";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import { applyStockOperation, listMovements } from "../services/stockService.js";
import { idParamSchema } from "../validation/product.js";
import { movementListQuerySchema, stockOperationSchema } from "../validation/stock.js";

export async function apply(req: Request, res: Response) {
  const { organizationId, userId } = authOf(req);
  const input = parseInput(stockOperationSchema, req.body);
  const operation =
    input.type === "count"
      ? { type: input.type, countedQuantity: input.countedQuantity, expectedQuantity: input.expectedQuantity }
      : input.type === "adjust"
        ? { type: input.type, delta: input.delta, expectedQuantity: input.expectedQuantity }
        : { type: input.type, quantity: input.quantity };
  const result = await applyStockOperation(organizationId, userId, {
    productId: input.productId,
    operation,
    source: input.source,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
  });
  res.status(result.replayed ? 200 : 201).json({ data: result });
}

export async function movements(req: Request, res: Response) {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw notFound("Product");
  const { limit } = parseInput(movementListQuerySchema, req.query);
  res.json({ data: await listMovements(authOf(req).organizationId, params.data.id, limit) });
}
