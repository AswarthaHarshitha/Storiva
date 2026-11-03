import type { Request, Response } from "express";
import { notFound } from "../lib/errors.js";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import * as products from "../services/productService.js";
import { idParamSchema, productInputSchema, productListQuerySchema, stockAdjustmentSchema } from "../validation/product.js";

/** A malformed ID cannot name any product, so it is reported the same way as a missing one. */
function productId(req: Request): string {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw notFound("Product");
  return parsed.data.id;
}

export async function list(req: Request, res: Response) {
  const { q } = parseInput(productListQuerySchema, req.query);
  res.json({ data: await products.listProducts(authOf(req).organizationId, q) });
}

export async function show(req: Request, res: Response) {
  res.json({ data: await products.getProduct(authOf(req).organizationId, productId(req)) });
}

export async function create(req: Request, res: Response) {
  const { organizationId, userId } = authOf(req);
  const input = parseInput(productInputSchema, req.body);
  res.status(201).json({ data: await products.createProduct(organizationId, userId, input) });
}

export async function update(req: Request, res: Response) {
  const { organizationId, userId } = authOf(req);
  const id = productId(req);
  const input = parseInput(productInputSchema, req.body);
  res.json({ data: await products.updateProduct(organizationId, userId, id, input) });
}

export async function adjustStock(req: Request, res: Response) {
  const { organizationId, userId } = authOf(req);
  const id = productId(req);
  const adjustment = parseInput(stockAdjustmentSchema, req.body);
  res.json({ data: await products.adjustStock(organizationId, userId, id, adjustment) });
}

export async function remove(req: Request, res: Response) {
  await products.deleteProduct(authOf(req).organizationId, productId(req));
  res.status(204).end();
}
