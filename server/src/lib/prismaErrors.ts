import { Prisma } from "@prisma/client";

/** A unique constraint was violated (e.g. duplicate email or SKU). */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** An update or delete matched no row. */
export const isRecordNotFound = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
