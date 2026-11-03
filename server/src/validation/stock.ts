import { z } from "zod";
import { canonicalFormat } from "../lib/barcode.js";

const format = z
  .string()
  .max(40)
  .refine((value) => canonicalFormat(value) !== null, "Unknown barcode format.")
  .optional();
const rawCode = z.string({ error: "Enter or scan a barcode." }).max(200, "Barcodes are limited to 200 characters.");

export const barcodeLookupSchema = z.object({ code: rawCode, format });

export const attachBarcodeSchema = z.object({ code: rawCode, format });

const units = (label: string) =>
  z
    .number({ error: `${label} must be a whole number.` })
    .int(`${label} must be a whole number.`)
    .max(1_000_000_000, `${label} is too large.`);

export const stockOperationSchema = z
  .object({
    productId: z.uuid({ error: "Choose a product." }),
    source: z.enum(["manual", "camera", "scanner"]).default("manual"),
    note: z
      .string()
      .trim()
      .max(200, "Use at most 200 characters.")
      .nullish()
      .transform((value) => value || null),
    // Generated once per user action by the client and sent again on retries.
    idempotencyKey: z
      .string({ error: "A request key is required." })
      .regex(/^[A-Za-z0-9_-]{8,64}$/, "The request key must be 8-64 letters, digits, dashes or underscores."),
  })
  .and(
    z.discriminatedUnion(
      "type",
      [
        z.object({ type: z.literal("receive"), quantity: units("Quantity").min(1, "Receive at least 1 unit.") }),
        z.object({ type: z.literal("issue"), quantity: units("Quantity").min(1, "Issue at least 1 unit.") }),
        z.object({
          type: z.literal("count"),
          countedQuantity: units("Counted quantity").min(0, "A count cannot be negative."),
          expectedQuantity: units("Expected quantity").min(0),
        }),
      ],
      { error: "Choose receive, issue or count." },
    ),
  );

export const movementListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
