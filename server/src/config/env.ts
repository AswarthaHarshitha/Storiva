import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Reverse proxies between the internet and this process in production. Express reads the
  // client address this many entries from the end of X-Forwarded-For, so it must match the
  // hosting setup exactly: too few and every client looks like the proxy, too many and the
  // client can forge its own address.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
