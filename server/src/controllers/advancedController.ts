import type { Request, Response } from "express";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { toCents } from "../lib/simulate.js";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import { askCopilot, matchProductText } from "../services/copilotService.js";
import { getEvidence, verifyField } from "../services/evidenceService.js";
import { listExceptions, recordSyncFailure, resolveException } from "../services/exceptionService.js";
import { commitImport, exportCsv, previewImport } from "../services/importService.js";
import * as receiving from "../services/receivingService.js";
import { correctionSummary, simulate, slowMoving, valuation } from "../services/reportService.js";
import { productTrust, trustOverview } from "../services/trustService.js";
import {
  copilotSchema,
  daysQuerySchema,
  importSchema,
  invoiceTextSchema,
  receiptSchema,
  recognizeSchema,
  resolveSchema,
  simulateSchema,
  supplierSchema,
  syncFailureSchema,
  verifyFieldSchema,
} from "../validation/advanced.js";

/** A resource id from the URL; a malformed one cannot name anything, so it is a 404. */
function idOf(req: Request, what: string): string {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

// Evidence
export const evidence = async (req: Request, res: Response) => {
  res.json({ data: await getEvidence(authOf(req).organizationId, idOf(req, "Product")) });
};
export const verifyEvidence = async (req: Request, res: Response) => {
  const { organizationId, userId } = authOf(req);
  const { field } = parseInput(verifyFieldSchema, req.body);
  res.json({ data: await verifyField(organizationId, userId, idOf(req, "Product"), field) });
};

// Trust Radar
export const trust = async (req: Request, res: Response) => {
  res.json({ data: await trustOverview(authOf(req).organizationId) });
};
export const trustOne = async (req: Request, res: Response) => {
  res.json({ data: await productTrust(authOf(req).organizationId, idOf(req, "Product")) });
};

// Exceptions
export const exceptions = async (req: Request, res: Response) => {
  const status = req.query.status === "closed" ? "closed" : "open";
  res.json({ data: await listExceptions(authOf(req).organizationId, status) });
};
export const resolve = async (req: Request, res: Response) => {
  const { organizationId, userId } = authOf(req);
  const { status, note } = parseInput(resolveSchema, req.body);
  await resolveException(organizationId, userId, idOf(req, "Exception"), status, note);
  res.status(204).end();
};
export const syncFailure = async (req: Request, res: Response) => {
  await recordSyncFailure(authOf(req).organizationId, parseInput(syncFailureSchema, req.body));
  res.status(204).end();
};

// Reports and simulation
export const reports = async (req: Request, res: Response) => {
  const { organizationId } = authOf(req);
  const { days } = parseInput(daysQuerySchema, req.query);
  const [value, slow, corrections] = await Promise.all([valuation(organizationId), slowMoving(organizationId, days), correctionSummary(organizationId, 30)]);
  res.json({ data: { valuation: value, slowMoving: slow, corrections } });
};
export const simulation = async (req: Request, res: Response) => {
  const input = parseInput(simulateSchema, req.body);
  res.json({
    data: await simulate(authOf(req).organizationId, input.productId, {
      extraUnits: input.extraUnits,
      demandChangePercent: input.demandChangePercent,
      delayDays: input.delayDays,
      newPriceCents: toCents(input.newPrice),
    }),
  });
};

// Suppliers
export const suppliers = async (req: Request, res: Response) => {
  res.json({ data: await receiving.listSuppliers(authOf(req).organizationId) });
};
export const createSupplier = async (req: Request, res: Response) => {
  res.status(201).json({ data: await receiving.saveSupplier(authOf(req).organizationId, parseInput(supplierSchema, req.body)) });
};
export const updateSupplier = async (req: Request, res: Response) => {
  res.json({ data: await receiving.saveSupplier(authOf(req).organizationId, parseInput(supplierSchema, req.body), idOf(req, "Supplier")) });
};
export const deleteSupplier = async (req: Request, res: Response) => {
  await receiving.deleteSupplier(authOf(req).organizationId, idOf(req, "Supplier"));
  res.status(204).end();
};

// Receipts and invoices
export const receipts = async (req: Request, res: Response) => {
  res.json({ data: await receiving.listReceipts(authOf(req).organizationId) });
};
export const receipt = async (req: Request, res: Response) => {
  res.json({ data: await receiving.getReceipt(authOf(req).organizationId, idOf(req, "Receipt")) });
};
export const createReceipt = async (req: Request, res: Response) => {
  const { organizationId, userId } = authOf(req);
  res.status(201).json({ data: await receiving.createReceipt(organizationId, userId, parseInput(receiptSchema, req.body)) });
};
export const updateReceipt = async (req: Request, res: Response) => {
  res.json({ data: await receiving.updateReceipt(authOf(req).organizationId, idOf(req, "Receipt"), parseInput(receiptSchema, req.body)) });
};
export const deleteReceipt = async (req: Request, res: Response) => {
  await receiving.deleteDraftReceipt(authOf(req).organizationId, idOf(req, "Receipt"));
  res.status(204).end();
};
export const confirmReceipt = async (req: Request, res: Response) => {
  const { organizationId, userId } = authOf(req);
  res.json({ data: await receiving.confirmReceipt(organizationId, userId, idOf(req, "Receipt")) });
};
export const parseInvoice = async (req: Request, res: Response) => {
  res.json({ data: await receiving.analyseInvoiceText(authOf(req).organizationId, parseInput(invoiceTextSchema, req.body).text) });
};

// Bulk import and export
export const importPreview = async (req: Request, res: Response) => {
  res.json({ data: await previewImport(authOf(req).organizationId, parseInput(importSchema, req.body).rows) });
};
export const importCommit = async (req: Request, res: Response) => {
  const { organizationId, userId } = authOf(req);
  const { fileName, rows } = parseInput(importSchema, req.body);
  res.status(201).json({ data: await commitImport(organizationId, userId, fileName, rows) });
};
export const exportProducts = async (req: Request, res: Response) => {
  const csv = await exportCsv(authOf(req).organizationId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="storiva-products-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
};

// Copilot and photo text
export const copilot = async (req: Request, res: Response) => {
  const { message, productId } = parseInput(copilotSchema, req.body);
  res.json({ data: await askCopilot(authOf(req).organizationId, message, productId) });
};
export const recognize = async (req: Request, res: Response) => {
  res.json({ data: { matches: await matchProductText(authOf(req).organizationId, parseInput(recognizeSchema, req.body).text) } });
};
