import { z } from "zod";

export const settingsSchema = z.object({
  defaultLowStockThreshold: z
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(0, "The threshold cannot be negative.")
    .max(1_000_000_000, "The threshold is too large."),
});
