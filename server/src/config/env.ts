import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
