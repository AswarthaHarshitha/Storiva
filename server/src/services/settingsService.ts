import { prisma } from "../lib/prisma.js";

const select = { name: true, defaultLowStockThreshold: true } as const;

export async function getSettings(organizationId: string) {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select });
  return { organizationName: organization.name, defaultLowStockThreshold: organization.defaultLowStockThreshold };
}

export async function updateSettings(organizationId: string, input: { defaultLowStockThreshold: number }) {
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: { defaultLowStockThreshold: input.defaultLowStockThreshold },
    select,
  });
  return { organizationName: organization.name, defaultLowStockThreshold: organization.defaultLowStockThreshold };
}
