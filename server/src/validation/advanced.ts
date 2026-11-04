import { z } from "zod";
import { IMPORT_COLUMNS } from "../services/importService.js";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullish()
    .transform((v) => v || null);
const price = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Use a non-negative amount with up to 2 decimals.")
  .nullish()
  .transform((v) => v ?? null);
const wholeNumber = (label: string) => z.number({ error: `${label} must be a whole number.` }).int(`${label} must be a whole number.`).min(0, `${label} cannot be negative.`).max(1_000_000_000);
const date = z.iso.date({ error: "Use a date like 2026-11-04." }).nullish().transform((v) => v ?? null);

export const supplierSchema = z.object({
  name: z.string({ error: "Name is required." }).trim().min(1, "Name is required.").max(120, "Use at most 120 characters."),
  email: z.string().trim().max(254).pipe(z.email("Enter a valid email address.")).nullish().or(z.literal("").transform(() => null)).transform((v) => v || null),
  phone: optionalText(40),
  notes: optionalText(1000),
});

const receiptLine = z
  .object({
    productId: z.uuid().nullish().transform((v) => v ?? null),
    description: z.string().trim().min(1, "Describe the item.").max(300),
    expectedQuantity: wholeNumber("Expected quantity").nullish().transform((v) => v ?? null),
    receivedQuantity: wholeNumber("Received quantity"),
    damagedQuantity: wholeNumber("Damaged quantity").default(0),
    unitCost: price,
    updateCost: z.boolean().default(false),
    matchConfidence: z.enum(["exact", "high", "medium", "low", "manual"]).nullish().transform((v) => v ?? null),
  })
  .refine((l) => l.damagedQuantity <= l.receivedQuantity, { path: ["damagedQuantity"], message: "Damaged units cannot exceed received units." })
  .refine((l) => !l.updateCost || l.unitCost !== null, { path: ["unitCost"], message: "Enter the unit cost to update the product's cost price." });

export const receiptSchema = z.object({
  supplierId: z.uuid().nullish().transform((v) => v ?? null),
  reference: optionalText(80),
  documentDate: date,
  expectedDate: date,
  source: z.enum(["manual", "invoice"]).default("manual"),
  documentText: z.string().max(100_000).nullish().transform((v) => v ?? null),
  totalAmount: price,
  notes: optionalText(1000),
  lines: z.array(receiptLine).min(1, "Add at least one line.").max(500, "Use at most 500 lines."),
});

export const invoiceTextSchema = z.object({ text: z.string().max(100_000, "The text is too long.") });

export const importSchema = z.object({
  fileName: z.string().trim().min(1).max(200).default("import.csv"),
  rows: z
    .array(z.partialRecord(z.enum(IMPORT_COLUMNS), z.string().max(2000)))
    .min(1, "The file has no rows.")
    .max(5000, "Import at most 5,000 rows at a time."),
});

export const resolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  note: z.string().trim().min(1, "Say how this was resolved.").max(500),
});

export const syncFailureSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  productId: z.uuid().nullish().transform((v) => v ?? null),
  productName: z.string().trim().min(1).max(200),
  operation: z.enum(["receive", "issue", "count"]),
  error: z.string().trim().min(1).max(300),
  queuedAt: z.iso.datetime(),
});

export const simulateSchema = z.object({
  productId: z.uuid(),
  extraUnits: z.number().int().min(0).max(1_000_000).default(0),
  demandChangePercent: z.number().int().min(-100).max(1000).default(0),
  delayDays: z.number().int().min(0).max(365).default(0),
  newPrice: price,
});

export const daysQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(60) });

export const copilotSchema = z.object({
  message: z.string().trim().min(1, "Ask a question.").max(300, "Keep it under 300 characters."),
  productId: z.uuid().optional(),
});

export const recognizeSchema = z.object({ text: z.string().trim().min(2, "No readable text.").max(5000) });

export const verifyFieldSchema = z.object({ field: z.string().max(30) });
