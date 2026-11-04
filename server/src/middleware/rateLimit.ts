import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { authOf } from "./requireAuth.js";

/**
 * The address a request is rate-limited by. Behind a CDN, Express's req.ip is only as good as
 * the proxy-hop count, which is not stable on Render; when CLIENT_IP_HEADER names a header the
 * edge sets itself (Cloudflare's cf-connecting-ip, which it overwrites on every request), that
 * header is used instead.
 */
interface RequestLike {
  ip?: string | undefined;
  get(name: string): string | undefined;
}

export function clientAddress(req: RequestLike, header: string | undefined): string {
  const fromHeader = header ? req.get(header)?.split(",")[0]?.trim() : undefined;
  return ipKeyGenerator(fromHeader || req.ip || "unknown");
}

// Slows down password guessing and mass sign-ups from a single address.
export const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => clientAddress(req, env.CLIENT_IP_HEADER),
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." } },
});

// The Copilot runs several queries per question; keep it to a human pace per organization.
export const copilotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => authOf(req).organizationId,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many questions at once. Please wait a moment." } },
});

// Catalogue lookups reach external services; limit each organization so one account cannot use
// up the shared provider budgets.
export const catalogueLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => authOf(req).organizationId,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many catalogue lookups. Please wait a minute and try again." } },
});
