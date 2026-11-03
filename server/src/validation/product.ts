import { z } from "zod";
import { OPEN_FACTS_IMAGE_HOSTS } from "../catalogue/openFacts.js";

const MAX_QUANTITY = 1_000_000_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullish()
    .transform((value) => (value ? value : null));

/** Prices travel as strings ("12.50") so no value ever passes through a binary float. */
const optionalPrice = (label: string) =>
  z
    .union([z.string(), z.number()], { error: `${label} must be a number.` })
    .nullish()
    .transform((value, ctx) => {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      if (text === "") return null;
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a non-negative amount with up to 2 decimals.` });
        return z.NEVER;
      }
      return text;
    });

const quantity = (label: string) =>
  z
    .number({ error: `${label} must be a whole number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(MAX_QUANTITY, `${label} is too large.`);

export const productInputSchema = z.object({
  name: z.string({ error: "Name is required." }).trim().min(1, "Name is required.").max(200, "Use at most 200 characters."),
  sku: z
    .string({ error: "SKU is required." })
    .trim()
    .min(1, "SKU is required.")
    .max(64, "Use at most 64 characters.")
    .regex(/^[A-Za-z0-9._\-/]+$/, "Use letters, numbers, dots, dashes, slashes or underscores."),
  description: optionalText(2000),
  quantityOnHand: quantity("Quantity"),
  costPrice: optionalPrice("Cost price"),
  sellingPrice: optionalPrice("Selling price"),
  lowStockThreshold: quantity("Low stock threshold").nullish().transform((value) => value ?? null),
  brand: optionalText(120),
  manufacturer: optionalText(200),
  category: optionalText(200),
  // Only catalogue images are accepted, so a product cannot be made to load images from
  // arbitrary sites.
  imageUrl: z
    .string()
    .max(500)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && OPEN_FACTS_IMAGE_HOSTS.includes(url.hostname);
      } catch {
        return false;
      }
    }, "Images can only come from a product catalogue.")
    .nullish()
    .transform((value) => value ?? null),
  // Where the details were retrieved from; recorded on create only.
  catalogue: z
    .object({
      provider: z.enum(["openfacts", "upcitemdb"]),
      sourceName: z.string().trim().min(1).max(60),
      retrievedAt: z.iso.datetime(),
    })
    .nullish()
    .transform((value) => value ?? null),
  // Used when creating a product; barcodes of an existing product have their own endpoints.
  barcodes: z.array(z.string().max(200), { error: "Barcodes must be a list." }).max(10, "Use at most 10 barcodes.").optional(),
});

export type ProductInput = z.output<typeof productInputSchema>;

export const stockAdjustmentSchema = z.object({
  delta: z
    .number({ error: "Enter a whole number of units." })
    .int("Enter a whole number of units.")
    .refine((value) => value !== 0, "Enter a change other than zero.")
    .refine((value) => Math.abs(value) <= MAX_QUANTITY, "That change is too large."),
  note: optionalText(200),
});

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export const idParamSchema = z.object({ id: z.uuid() });
