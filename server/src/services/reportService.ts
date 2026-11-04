import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { fromCents, simulateProduct, toCents, type Scenario } from "../lib/simulate.js";

const DAY = 24 * 60 * 60 * 1000;

/** Stock value at cost and at selling price, from recorded quantities and prices only. */
export async function valuation(organizationId: string) {
  const products = await prisma.product.findMany({ where: { organizationId }, select: { quantityOnHand: true, costPrice: true, sellingPrice: true } });
  let cost = 0;
  let price = 0;
  let missingCost = 0;
  let missingPrice = 0;
  for (const p of products) {
    if (p.quantityOnHand === 0) continue;
    const c = toCents(p.costPrice?.toFixed(2) ?? null);
    const s = toCents(p.sellingPrice?.toFixed(2) ?? null);
    if (c === null) missingCost += 1;
    else cost += c * p.quantityOnHand;
    if (s === null) missingPrice += 1;
    else price += s * p.quantityOnHand;
  }
  return {
    atCost: fromCents(cost),
    atSellingPrice: fromCents(price),
    productsInStock: products.filter((p) => p.quantityOnHand > 0).length,
    missingCost,
    missingPrice,
  };
}

/**
 * Products holding stock that has not been issued for `days`. Products whose recorded history is
 * shorter than that are listed separately as "too new to judge" rather than called slow.
 */
export async function slowMoving(organizationId: string, days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY);
  const [products, issued, firstSeen] = await Promise.all([
    prisma.product.findMany({ where: { organizationId, quantityOnHand: { gt: 0 } }, select: { id: true, name: true, sku: true, quantityOnHand: true, costPrice: true, createdAt: true } }),
    prisma.stockMovement.findMany({ where: { organizationId, type: "issue", createdAt: { gte: since } }, select: { productId: true }, distinct: ["productId"] }),
    prisma.stockMovement.groupBy({ by: ["productId"], where: { organizationId }, _min: { createdAt: true } }),
  ]);
  const moving = new Set(issued.map((m) => m.productId));
  const start = new Map(firstSeen.map((f) => [f.productId, f._min.createdAt]));
  const slow = [];
  let tooNew = 0;
  let capital = 0;
  let unpriced = 0;
  for (const p of products) {
    if (moving.has(p.id)) continue;
    const historyStart = start.get(p.id) ?? null;
    if (!historyStart || historyStart > since) {
      tooNew += 1;
      continue;
    }
    const cents = toCents(p.costPrice?.toFixed(2) ?? null);
    if (cents === null) unpriced += 1;
    else capital += cents * p.quantityOnHand;
    slow.push({ id: p.id, name: p.name, sku: p.sku, quantity: p.quantityOnHand, valueAtCost: fromCents(cents === null ? null : cents * p.quantityOnHand) });
  }
  slow.sort((a, b) => Number(b.valueAtCost ?? 0) - Number(a.valueAtCost ?? 0));
  return { days, products: slow, capitalAtCost: fromCents(capital), withoutCost: unpriced, tooNewToJudge: tooNew };
}

/** Manual corrections (edits and adjustments) over the last `days`, grouped by product. */
export async function correctionSummary(organizationId: string, days: number, now = new Date()) {
  const rows = await prisma.stockMovement.groupBy({
    by: ["productId", "productName", "productSku"],
    where: { organizationId, type: { in: ["adjust", "edit"] }, quantityChange: { not: 0 }, createdAt: { gte: new Date(now.getTime() - days * DAY) } },
    _count: { _all: true },
    _sum: { quantityChange: true },
  });
  return rows
    .map((r) => ({ productId: r.productId, name: r.productName, sku: r.productSku, corrections: r._count._all, netChange: r._sum.quantityChange ?? 0 }))
    .sort((a, b) => b.corrections - a.corrections || Math.abs(b.netChange) - Math.abs(a.netChange))
    .slice(0, 15);
}

export async function simulate(organizationId: string, productId: string, scenario: Scenario, now = new Date()) {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw notFound("Product");
  const [issues, first] = await Promise.all([
    prisma.stockMovement.findMany({ where: { organizationId, productId, type: "issue" }, select: { quantityChange: true, createdAt: true } }),
    prisma.stockMovement.findFirst({ where: { organizationId, productId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const result = simulateProduct(
    {
      quantity: product.quantityOnHand,
      costCents: toCents(product.costPrice?.toFixed(2) ?? null),
      priceCents: toCents(product.sellingPrice?.toFixed(2) ?? null),
      issues: issues.map((i) => ({ units: -i.quantityChange, at: i.createdAt })),
      historyStart: first?.createdAt ?? null,
    },
    scenario,
    now,
  );
  return { product: { id: product.id, name: product.name, sku: product.sku }, scenario, ...result };
}
