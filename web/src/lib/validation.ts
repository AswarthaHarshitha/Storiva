import { z } from "zod";
import type { FieldErrors } from "../api/client";
import type { ProductPayload } from "../api/types";

// These mirror the server's rules so people get feedback before submitting.
// The server validates again and remains the authority.

const MAX_QUANTITY = 1_000_000_000;

export const signupSchema = z
  .object({
    organizationName: z.string().trim().min(2, "Use at least 2 characters.").max(120, "Use at most 120 characters."),
    email: z.string().trim().min(1, "Email is required.").pipe(z.email("Enter a valid email address.")),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use at most 72 characters.")
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Include at least one letter and one number."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Password is required."),
});

const wholeNumber = (label: string, { optional }: { optional: boolean }) =>
  z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      if (!optional) ctx.addIssue({ code: "custom", message: `${label} is required.` });
      return;
    }
    if (!/^\d+$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: value.startsWith("-") ? `${label} cannot be negative.` : `${label} must be a whole number.`,
      });
    } else if (Number(value) > MAX_QUANTITY) {
      ctx.addIssue({ code: "custom", message: `${label} is too large.` });
    }
  });

const price = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
      `${label} must be a non-negative amount with up to 2 decimals.`,
    );

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Use at most 200 characters."),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required.")
    .max(64, "Use at most 64 characters.")
    .regex(/^[A-Za-z0-9._\-/]+$/, "Use letters, numbers, dots, dashes, slashes or underscores."),
  description: z.string().max(2000, "Use at most 2000 characters."),
  quantityOnHand: wholeNumber("Quantity", { optional: false }),
  lowStockThreshold: wholeNumber("Threshold", { optional: true }),
  costPrice: price("Cost price"),
  sellingPrice: price("Selling price"),
});

export type ProductFormValues = z.input<typeof productFormSchema>;

export const toProductPayload = (values: ProductFormValues): ProductPayload => ({
  name: values.name.trim(),
  sku: values.sku.trim(),
  description: values.description.trim() || null,
  quantityOnHand: Number(values.quantityOnHand),
  lowStockThreshold: values.lowStockThreshold.trim() === "" ? null : Number(values.lowStockThreshold),
  costPrice: values.costPrice.trim() || null,
  sellingPrice: values.sellingPrice.trim() || null,
});

export const thresholdSchema = z.object({ defaultLowStockThreshold: wholeNumber("Threshold", { optional: false }) });

/** Runs a schema and returns the first message per field, or null when the values are valid. */
export function validate<S extends z.ZodType>(schema: S, values: unknown): FieldErrors | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}
