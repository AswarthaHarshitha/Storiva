import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const sessionTtlMs = () => env.SESSION_TTL_DAYS * DAY_MS;

/**
 * Creates a session and returns the raw token for the cookie. Only its hash is stored.
 * The user's expired sessions are removed at the same time so abandoned ones don't pile up.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } }),
    prisma.session.create({
      data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + sessionTtlMs()) },
    }),
  ]);
  return token;
}

export async function findActiveSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: { id: true, organizationId: true } } },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session;
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
