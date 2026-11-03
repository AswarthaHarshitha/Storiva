import type { CookieOptions, Request, RequestHandler } from "express";
import { isProduction } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { findActiveSession, sessionTtlMs } from "../services/sessionService.js";

export const SESSION_COOKIE = "storiva_session";

export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: sessionTtlMs(),
});

export const readSessionToken = (req: Request): string | undefined => {
  const value: unknown = req.cookies[SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readSessionToken(req);
  const session = token ? await findActiveSession(token) : null;
  if (!session) {
    throw new HttpError(401, "UNAUTHENTICATED", "Please log in to continue.");
  }
  req.auth = { sessionId: session.id, userId: session.user.id, organizationId: session.user.organizationId };
  next();
};

/** Returns the authenticated context; only valid on routes behind requireAuth. */
export function authOf(req: Request) {
  if (!req.auth) throw new HttpError(401, "UNAUTHENTICATED", "Please log in to continue.");
  return req.auth;
}
