import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Product catalogues to consult for unknown barcodes, in order: "openfacts", "upcitemdb", or
  // "none". UPCitemdb's free plan is off by default until its terms are confirmed.
  CATALOGUE_PROVIDERS: z
    .string()
    .default("openfacts")
    .transform((value) => value.split(",").map((part) => part.trim()).filter((part) => part && part !== "none"))
    .pipe(z.array(z.enum(["openfacts", "upcitemdb"]))),
  // Identifies Storiva to catalogue providers in the User-Agent, as Open Food Facts asks.
  CATALOGUE_CONTACT: z.string().max(200).default("+https://storiva-wovt.onrender.com"),
  // A header set by the edge proxy that holds the real client IP (cf-connecting-ip on Render,
  // which sits behind Cloudflare). Only set this when every request passes through that proxy,
  // otherwise clients could choose their own rate-limit key.
  CLIENT_IP_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
