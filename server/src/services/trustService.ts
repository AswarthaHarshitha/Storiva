import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assessTrust, type LedgerEntry, type TrustAssessment, type TrustLevel } from "../lib/trust.js";

export interface ProductTrust extends TrustAssessment {
  id: string;
  name: string;
  sku: string;
}

async function ledgerByProduct(organizationId: string, productId?: string) {
  const movements = await prisma.stockMovement.findMany({
    where: { organizationId, productId: productId ?? { not: null } },
    select: { productId: true, type: true, quantityBefore: true, quantityChange: true, quantityAfter: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const byProduct = new Map<string, LedgerEntry[]>();
  for (const m of movements) {
    if (!m.productId) continue;
    const list = byProduct.get(m.productId) ?? [];
    list.push(m);
    byProduct.set(m.productId, list);
  }
  return byProduct;
}

export async function trustOverview(organizationId: string, now = new Date()) {
  const [products, ledger] = await Promise.all([
    prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, sku: true, quantityOnHand: true }, orderBy: { name: "asc" } }),
    ledgerByProduct(organizationId),
  ]);
  const assessed: ProductTrust[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    ...assessTrust(p.quantityOnHand, ledger.get(p.id) ?? [], now),
  }));
  const summary: Record<TrustLevel, number> = { high: 0, medium: 0, low: 0, unverified: 0 };
  for (const p of assessed) summary[p.level] += 1;
  // What to count next: the most doubtful first, then the products holding the most units.
  const queue = assessed
    .filter((p) => p.level !== "high")
    .sort((a, b) => a.priority - b.priority || b.currentQuantity - a.currentQuantity || a.name.localeCompare(b.name))
    .slice(0, 10);
  return { summary, products: assessed, queue };
}

export async function productTrust(organizationId: string, productId: string, now = new Date()): Promise<ProductTrust> {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true, name: true, sku: true, quantityOnHand: true } });
  if (!product) throw notFound("Product");
  const ledger = await ledgerByProduct(organizationId, productId);
  return { id: product.id, name: product.name, sku: product.sku, ...assessTrust(product.quantityOnHand, ledger.get(productId) ?? [], now) };
}
