import type { Request, Response } from "express";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import { attachBarcode, lookupBarcode, removeBarcode } from "../services/barcodeService.js";
import { idParamSchema } from "../validation/product.js";
import { attachBarcodeSchema, barcodeLookupSchema } from "../validation/stock.js";

const barcodeParams = z.object({ id: z.uuid(), barcodeId: z.uuid() });

export async function lookup(req: Request, res: Response) {
  const { code, format } = parseInput(barcodeLookupSchema, req.query);
  res.json({ data: await lookupBarcode(authOf(req).organizationId, code, format) });
}

export async function attach(req: Request, res: Response) {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw notFound("Product");
  const { organizationId, userId } = authOf(req);
  const { code, format } = parseInput(attachBarcodeSchema, req.body);
  res.status(201).json({ data: await attachBarcode(organizationId, userId, params.data.id, code, format) });
}

export async function remove(req: Request, res: Response) {
  const params = barcodeParams.safeParse(req.params);
  if (!params.success) throw notFound("Barcode");
  res.json({ data: await removeBarcode(authOf(req).organizationId, params.data.id, params.data.barcodeId) });
}
