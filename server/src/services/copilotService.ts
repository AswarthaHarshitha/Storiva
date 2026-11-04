import { parseIntent, type Intent } from "../lib/copilotIntent.js";
import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { rankMatches } from "../lib/textMatch.js";
import { getDashboard } from "./dashboardService.js";
import { detectExceptions } from "./exceptionService.js";
import { valuation } from "./reportService.js";
import { trustOverview } from "./trustService.js";

export interface CopilotItem {
  id: string | null;
  name: string;
  sku: string;
  detail: string;
}

export interface CopilotProposal {
  productId: string;
  name: string;
  sku: string;
  delta: number;
  expectedQuantity: number;
  resultingQuantity: number;
  summary: string;
}

export interface CopilotReply {
  intent: Intent["kind"];
  text: string;
  items?: CopilotItem[];
  /** A stock change waiting for the person's confirmation. Nothing has been changed yet. */
  proposal?: CopilotProposal;
  /** Several products could be meant; the person picks one. */
  candidates?: { id: string; name: string; sku: string; quantity: number }[];
}

const EXAMPLES = [
  "Which products are running low?",
  "Which products have not been physically verified?",
  "Which products have the highest inventory value?",
  "Which products have unusual stock adjustments?",
  "Which products need replenishment?",
  "Show my stock adjustment history",
  "Increase Wireless Optical Mouse by 10",
  "Set USB-C Cable 1m to 25",
];

const units = (n: number) => `${n} ${n === 1 ? "unit" : "units"}`;

export async function askCopilot(organizationId: string, message: string, productId?: string): Promise<CopilotReply> {
  const intent = parseIntent(message);

  switch (intent.kind) {
    case "change":
    case "set":
    case "history": {
      const product = productId ? await prisma.product.findFirst({ where: { id: productId, organizationId } }) : null;
      if (productId && !product) throw notFound("Product");
      const resolved = product ?? (await resolveProduct(organizationId, intent.productText));
      if ("candidates" in resolved) {
        return resolved.candidates.length === 0
          ? { intent: intent.kind, text: `I could not find a product matching "${intent.productText}". Try its name or SKU.` }
          : { intent: intent.kind, text: `Which product do you mean by "${intent.productText}"?`, candidates: resolved.candidates };
      }
      const p = resolved;
      if (intent.kind === "history") {
        const moves = await prisma.stockMovement.findMany({ where: { organizationId, productId: p.id }, orderBy: { createdAt: "desc" }, take: 10 });
        return {
          intent: intent.kind,
          text: moves.length ? `The last ${moves.length} stock changes for ${p.name}:` : `No stock changes are recorded for ${p.name}.`,
          items: moves.map((m) => ({ id: p.id, name: m.type, sku: m.createdAt.toISOString().slice(0, 10), detail: `${m.quantityBefore} → ${m.quantityAfter} (${m.source})` })),
        };
      }
      const delta = intent.kind === "set" ? intent.quantity - p.quantityOnHand : intent.direction === "in" ? intent.quantity : -intent.quantity;
      if (delta === 0) return { intent: intent.kind, text: `${p.name} already has ${units(p.quantityOnHand)}. Nothing to change.` };
      if (p.quantityOnHand + delta < 0) {
        return { intent: intent.kind, text: `${p.name} has only ${units(p.quantityOnHand)}, so it cannot go down by ${Math.abs(delta)}.` };
      }
      const resulting = p.quantityOnHand + delta;
      return {
        intent: intent.kind,
        text: `Please confirm this change. Nothing has been changed yet.`,
        proposal: {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          delta,
          expectedQuantity: p.quantityOnHand,
          resultingQuantity: resulting,
          summary: `${p.name}: ${p.quantityOnHand} → ${resulting} (${delta > 0 ? "+" : "−"}${Math.abs(delta)})`,
        },
      };
    }

    case "low_stock":
    case "replenish": {
      const { lowStockItems } = await getDashboard(organizationId);
      if (lowStockItems.length === 0) return { intent: intent.kind, text: "No products are at or below their low-stock threshold." };
      return {
        intent: intent.kind,
        text:
          intent.kind === "low_stock"
            ? `${lowStockItems.length} ${lowStockItems.length === 1 ? "product is" : "products are"} at or below the low-stock threshold, lowest first:`
            : `These ${lowStockItems.length} products are at or below their threshold. The figure shown is the minimum to bring each above its threshold; order more if you expect demand.`,
        items: lowStockItems.slice(0, 20).map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          detail:
            intent.kind === "low_stock"
              ? `${units(i.quantityOnHand)} (threshold ${i.effectiveThreshold})`
              : `${units(i.quantityOnHand)} on hand · order at least ${i.effectiveThreshold - i.quantityOnHand + 1}`,
        })),
      };
    }

    case "unverified": {
      const { queue, summary } = await trustOverview(organizationId);
      return {
        intent: intent.kind,
        text: `${summary.unverified} ${summary.unverified === 1 ? "product has" : "products have"} never been counted, and ${summary.low + summary.medium} have an ageing or doubtful count. These are the ones to count first:`,
        items: queue.map((q) => ({ id: q.id, name: q.name, sku: q.sku, detail: q.reasons[0] ?? q.recommendation })),
      };
    }

    case "top_value": {
      const products = await prisma.product.findMany({ where: { organizationId, quantityOnHand: { gt: 0 }, costPrice: { not: null } }, select: { id: true, name: true, sku: true, quantityOnHand: true, costPrice: true } });
      const ranked = products
        .map((p) => ({ ...p, cents: Math.round(Number(p.costPrice) * 100) * p.quantityOnHand }))
        .sort((a, b) => b.cents - a.cents)
        .slice(0, 10);
      const missing = await prisma.product.count({ where: { organizationId, quantityOnHand: { gt: 0 }, costPrice: null } });
      return {
        intent: intent.kind,
        text: ranked.length
          ? `Products holding the most stock value at cost${missing ? ` (${missing} products without a cost price are not included)` : ""}:`
          : "No products in stock have a cost price, so stock value cannot be calculated.",
        items: ranked.map((p) => ({ id: p.id, name: p.name, sku: p.sku, detail: `${(p.cents / 100).toFixed(2)} (${units(p.quantityOnHand)} × ${p.costPrice?.toFixed(2)})` })),
      };
    }

    case "total_value": {
      const v = await valuation(organizationId);
      return {
        intent: intent.kind,
        text: `Stock value is ${v.atCost} at cost and ${v.atSellingPrice} at selling price, across ${v.productsInStock} products in stock.${v.missingCost ? ` ${v.missingCost} products without a cost price are not included at cost.` : ""}`,
      };
    }

    case "unusual": {
      await detectExceptions(organizationId);
      const open = await prisma.inventoryException.findMany({
        where: { organizationId, status: "open", type: { in: ["unusual_adjustment", "count_discrepancy"] } },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
      return {
        intent: intent.kind,
        text: open.length
          ? `${open.length} open ${open.length === 1 ? "finding" : "findings"} about count differences or large manual corrections:`
          : "No unusual adjustments or count differences are open.",
        items: open.map((e) => ({ id: e.product?.id ?? null, name: e.product?.name ?? e.title, sku: e.product?.sku ?? "", detail: e.title })),
      };
    }

    case "adjustment_history": {
      const moves = await prisma.stockMovement.findMany({
        where: { organizationId, type: { in: ["adjust", "edit", "count"] }, quantityChange: { not: 0 } },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      return {
        intent: intent.kind,
        text: moves.length ? "The most recent corrections and count differences:" : "No stock corrections are recorded yet.",
        items: moves.map((m) => ({
          id: m.productId,
          name: m.productName,
          sku: m.productSku,
          detail: `${m.createdAt.toISOString().slice(0, 10)} · ${m.type} ${m.quantityChange > 0 ? "+" : ""}${m.quantityChange} (${m.quantityBefore} → ${m.quantityAfter})`,
        })),
      };
    }

    case "help":
      return {
        intent: "help",
        text: `I understand questions and changes like these: ${EXAMPLES.map((e) => `"${e}"`).join(", ")}.`,
      };
  }
}

async function resolveProduct(organizationId: string, productText: string) {
  const products = await prisma.product.findMany({ where: { organizationId }, include: { barcodes: { select: { code: true } } } });
  const matches = rankMatches(productText, products.map((p) => ({ ...p, barcodes: p.barcodes.map((b) => b.code) })), 5);
  const [top, second] = matches;
  // Act only on an unambiguous match; otherwise ask.
  if (top && (top.confidence === "exact" || (top.confidence === "high" && (!second || top.score - second.score >= 0.15)))) return top.product;
  return { candidates: matches.map((m) => ({ id: m.product.id, name: m.product.name, sku: m.product.sku, quantity: m.product.quantityOnHand })) };
}

/** Products whose name, brand, SKU or barcode match words read from a photo. Suggestions only. */
export async function matchProductText(organizationId: string, text: string) {
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, name: true, sku: true, brand: true, quantityOnHand: true, barcodes: { select: { code: true } } },
  });
  return rankMatches(text, products.map((p) => ({ ...p, barcodes: p.barcodes.map((b) => b.code) })), 5).map((m) => ({
    productId: m.product.id,
    name: m.product.name,
    sku: m.product.sku,
    quantity: m.product.quantityOnHand,
    confidence: m.confidence,
    reason: m.reason,
  }));
}
