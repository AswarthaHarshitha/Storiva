import type { Request, Response } from "express";
import { parseInput } from "../middleware/validate.js";
import { authOf, readSessionToken, SESSION_COOKIE, sessionCookieOptions } from "../middleware/requireAuth.js";
import { getAccount, signUp, verifyCredentials } from "../services/authService.js";
import { createSession, revokeSession } from "../services/sessionService.js";
import { loginSchema, signupSchema } from "../validation/auth.js";

async function startSession(res: Response, userId: string) {
  const token = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function signup(req: Request, res: Response) {
  const input = parseInput(signupSchema, req.body);
  const user = await signUp(input);
  await startSession(res, user.id);
  res.status(201).json({ data: await getAccount(user.id) });
}

export async function login(req: Request, res: Response) {
  const input = parseInput(loginSchema, req.body);
  const user = await verifyCredentials(input.email, input.password);
  // Replace any session the browser already holds rather than leaving it behind.
  const previous = readSessionToken(req);
  if (previous) await revokeSession(previous);
  await startSession(res, user.id);
  res.json({ data: await getAccount(user.id) });
}

export async function logout(req: Request, res: Response) {
  const token = readSessionToken(req);
  if (token) await revokeSession(token);
  // Express 5 ignores maxAge/expires here, so the same options clear the cookie.
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: await getAccount(authOf(req).userId) });
}
