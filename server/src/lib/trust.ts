/**
 * Inventory Trust Radar: how far a product's recorded quantity can be relied on, from what the
 * stock ledger shows. The level is decided by fixed rules, each of which produces a reason, so
 * every result can be explained and tested. It is a guide to what to count next, not a
 * probability that the number is right.
 */

export type TrustLevel = "high" | "medium" | "low" | "unverified";

export interface LedgerEntry {
  type: "create" | "edit" | "adjust" | "receive" | "issue" | "count";
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  createdAt: Date;
}

export interface TrustAssessment {
  level: TrustLevel;
  reasons: string[];
  recommendation: string;
  currentQuantity: number;
  lastCount: { date: Date; countedQuantity: number; difference: number } | null;
  daysSinceCount: number | null;
  /** The last count's difference, if no later count has re-checked it. */
  unresolvedDifference: number | null;
  correctionsSinceCount: number;
  changesSinceCount: number;
  countsWithDifference: number;
  countsConsidered: number;
  /** Lower is more urgent; used to order the verification queue. */
  priority: number;
}

const DAY = 24 * 60 * 60 * 1000;
const rank: Record<TrustLevel, number> = { high: 0, medium: 1, low: 2, unverified: 3 };
const worst = (a: TrustLevel, b: TrustLevel): TrustLevel => (rank[a] >= rank[b] ? a : b);

export const TRUST_RULES = {
  staleAfterDays: 90,
  ageingAfterDays: 30,
  manyCorrections: 3,
  recentCounts: 5,
} as const;

/** @param entries the product's ledger, oldest first */
export function assessTrust(currentQuantity: number, entries: LedgerEntry[], now: Date): TrustAssessment {
  const counts = entries.filter((e) => e.type === "count");
  const last = counts.at(-1) ?? null;
  const sinceCount = last ? entries.slice(entries.lastIndexOf(last) + 1) : entries;
  const corrections = sinceCount.filter((e) => (e.type === "edit" || e.type === "adjust") && e.quantityChange !== 0).length;
  const recent = counts.slice(-TRUST_RULES.recentCounts);
  const withDifference = recent.filter((c) => c.quantityChange !== 0).length;

  const base = {
    currentQuantity,
    correctionsSinceCount: corrections,
    changesSinceCount: sinceCount.filter((e) => e.quantityChange !== 0).length,
    countsWithDifference: withDifference,
    countsConsidered: recent.length,
  };

  if (!last) {
    const reasons = ["This product has never been physically counted since stock history began."];
    if (corrections > 0) reasons.push(`Its quantity has been corrected by hand ${corrections} ${corrections === 1 ? "time" : "times"}.`);
    return {
      ...base,
      level: "unverified",
      reasons,
      recommendation: "Count it to establish a verified quantity.",
      lastCount: null,
      daysSinceCount: null,
      unresolvedDifference: null,
      priority: currentQuantity > 0 ? 0 : 1,
    };
  }

  const days = Math.floor((now.getTime() - last.createdAt.getTime()) / DAY);
  let level: TrustLevel = "high";
  const reasons: string[] = [];
  const unresolved = last.quantityChange !== 0 ? last.quantityChange : null;

  if (days > TRUST_RULES.staleAfterDays) {
    level = worst(level, "low");
    reasons.push(`Last counted ${days} days ago (more than ${TRUST_RULES.staleAfterDays}).`);
  } else if (days > TRUST_RULES.ageingAfterDays) {
    level = worst(level, "medium");
    reasons.push(`Last counted ${days} days ago (more than ${TRUST_RULES.ageingAfterDays}).`);
  } else {
    reasons.push(`Counted ${days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} ago`}.`);
  }

  if (unresolved !== null) {
    level = worst(level, "low");
    reasons.push(`The last count differed from the system by ${unresolved > 0 ? "+" : ""}${unresolved} and has not been re-checked.`);
  }

  if (corrections >= TRUST_RULES.manyCorrections) {
    level = worst(level, "low");
    reasons.push(`Corrected by hand ${corrections} times since the last count.`);
  } else if (corrections > 0) {
    level = worst(level, "medium");
    reasons.push(`Corrected by hand ${corrections} ${corrections === 1 ? "time" : "times"} since the last count.`);
  }

  if (recent.length >= 2 && withDifference >= 2) {
    level = worst(level, withDifference > recent.length / 2 ? "low" : "medium");
    reasons.push(`${withDifference} of the last ${recent.length} counts found a difference.`);
  }

  if (level === "high") reasons.push("No unexplained changes since then.");

  const recommendation =
    level === "high"
      ? `No action needed. Count again within ${Math.max(TRUST_RULES.ageingAfterDays - days, 1)} days.`
      : unresolved !== null
        ? "Recount to confirm or correct the last difference."
        : "Count it to re-establish a verified quantity.";

  return {
    ...base,
    level,
    reasons,
    recommendation,
    lastCount: { date: last.createdAt, countedQuantity: last.quantityAfter, difference: last.quantityChange },
    daysSinceCount: days,
    unresolvedDifference: unresolved,
    priority: rank[level] === 0 ? 9 : 4 - rank[level] + (unresolved !== null ? 0 : 1),
  };
}
