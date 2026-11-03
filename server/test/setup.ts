import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe("TRUNCATE organizations, users, sessions, products CASCADE");
});

afterAll(async () => {
  await prisma.$disconnect();
});
