import { prisma } from "../lib/prisma.js";

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  quantityOnHand: number;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
}

/** All figures come straight from the organization's product rows. */
export async function getDashboard(organizationId: string) {
  const [organization, totals, lowStockItems] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, defaultLowStockThreshold: true },
    }),
    prisma.product.aggregate({ where: { organizationId }, _count: { _all: true }, _sum: { quantityOnHand: true } }),
    prisma.$queryRaw<LowStockItem[]>`
      SELECT p.id,
             p.name,
             p.sku,
             p.quantity_on_hand AS "quantityOnHand",
             p.low_stock_threshold AS "lowStockThreshold",
             COALESCE(p.low_stock_threshold, o.default_low_stock_threshold) AS "effectiveThreshold"
        FROM products p
        JOIN organizations o ON o.id = p.organization_id
       WHERE p.organization_id = ${organizationId}::uuid
         AND p.quantity_on_hand <= COALESCE(p.low_stock_threshold, o.default_low_stock_threshold)
       ORDER BY p.quantity_on_hand ASC, p.name ASC`,
  ]);

  return {
    organizationName: organization.name,
    defaultLowStockThreshold: organization.defaultLowStockThreshold,
    totalProducts: totals._count._all,
    totalQuantity: totals._sum.quantityOnHand ?? 0,
    lowStockCount: lowStockItems.length,
    lowStockItems,
  };
}
