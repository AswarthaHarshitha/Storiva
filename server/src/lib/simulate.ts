/**
 * Decision simulator. Pure arithmetic on recorded facts: nothing here reads or changes stock.
 * Demand is taken only from recorded issues; when there is too little history the simulator
 * says so instead of projecting.
 */

const DAY = 24 * 60 * 60 * 1000;
export const DEMAND_WINDOW_DAYS = 90;
const MIN_OBSERVED_DAYS = 14;
const MIN_ISSUE_EVENTS = 3;

/** Money in whole cents, so sums never pick up floating-point error. */
export const toCents = (value: string | null): number | null => (value === null ? null : Math.round(Number(value) * 100));
export const fromCents = (cents: number | null): string | null => (cents === null ? null : (cents / 100).toFixed(2));

export interface ProductFacts {
  quantity: number;
  costCents: number | null;
  priceCents: number | null;
  /** Issued units with their dates, from the ledger. */
  issues: { units: number; at: Date }[];
  /** When the product's recorded history starts. */
  historyStart: Date | null;
}

export interface Demand {
  dailyUnits: number;
  units: number;
  days: number;
  events: number;
}

export function observedDemand(facts: ProductFacts, now: Date): { demand: Demand | null; why: string | null } {
  if (!facts.historyStart) return { demand: null, why: "There is no recorded stock history for this product." };
  const windowStart = new Date(Math.max(facts.historyStart.getTime(), now.getTime() - DEMAND_WINDOW_DAYS * DAY));
  const days = Math.floor((now.getTime() - windowStart.getTime()) / DAY);
  const issues = facts.issues.filter((i) => i.at >= windowStart);
  if (days < MIN_OBSERVED_DAYS || issues.length < MIN_ISSUE_EVENTS) {
    return {
      demand: null,
      why: `Only ${days} ${days === 1 ? "day" : "days"} of history with ${issues.length} recorded ${issues.length === 1 ? "issue" : "issues"}; at least ${MIN_OBSERVED_DAYS} days and ${MIN_ISSUE_EVENTS} issues are needed to estimate demand.`,
    };
  }
  const units = issues.reduce((sum, i) => sum + i.units, 0);
  return { demand: { dailyUnits: units / days, units, days, events: issues.length }, why: null };
}

export interface Scenario {
  extraUnits: number;
  demandChangePercent: number;
  delayDays: number;
  newPriceCents: number | null;
}

export function simulateProduct(facts: ProductFacts, scenario: Scenario, now: Date) {
  const { demand, why } = observedDemand(facts, now);
  const projectedQuantity = facts.quantity + scenario.extraUnits;
  const priceCents = scenario.newPriceCents ?? facts.priceCents;
  const value = (qty: number, cents: number | null) => (cents === null ? null : qty * cents);
  const margin = (price: number | null) => (price === null || facts.costCents === null ? null : price - facts.costCents);

  const assumptions = [
    `Cost and selling prices are the product's current recorded values${scenario.newPriceCents !== null ? ", with the new selling price you entered" : ""}.`,
    "Purchased units arrive in full and none are damaged.",
  ];
  const uncertainty: string[] = [];
  if (facts.costCents === null) uncertainty.push("No cost price is recorded, so purchase cost and stock value at cost cannot be calculated.");
  if (priceCents === null) uncertainty.push("No selling price is recorded, so value at selling price and margin cannot be calculated.");

  let cover: { current: number; projected: number; stockoutDate: string | null; atDelivery: number | null; adjustedDailyUnits: number } | null = null;
  if (demand) {
    const daily = demand.dailyUnits * (1 + scenario.demandChangePercent / 100);
    assumptions.push(
      `Demand is ${round(demand.dailyUnits)} units a day, the average of ${demand.units} units issued over the last ${demand.days} days${scenario.demandChangePercent ? `, changed by ${scenario.demandChangePercent > 0 ? "+" : ""}${scenario.demandChangePercent}%` : ""}.`,
    );
    uncertainty.push("Future demand may differ from the recent average; the projection does not account for seasonality or promotions.");
    if (daily > 0) {
      const days = projectedQuantity / daily;
      cover = {
        current: round(facts.quantity / daily),
        projected: round(days),
        stockoutDate: new Date(now.getTime() + Math.floor(days) * DAY).toISOString().slice(0, 10),
        atDelivery: scenario.delayDays > 0 ? Math.floor(facts.quantity - daily * scenario.delayDays) : null,
        adjustedDailyUnits: round(daily),
      };
      if (cover.atDelivery !== null) {
        assumptions.push(`The purchase arrives ${scenario.delayDays} days from now; stock until then falls at the projected rate.`);
      }
    } else {
      uncertainty.push("With the demand change applied, no units would be issued, so stock would not run out.");
    }
  } else if (why) {
    uncertainty.push(`Demand-based figures are not shown: ${why}`);
  }

  return {
    actual: {
      quantity: facts.quantity,
      valueAtCost: fromCents(value(facts.quantity, facts.costCents)),
      valueAtPrice: fromCents(value(facts.quantity, facts.priceCents)),
      marginPerUnit: fromCents(margin(facts.priceCents)),
    },
    projected: {
      quantity: projectedQuantity,
      purchaseCost: fromCents(facts.costCents === null ? null : scenario.extraUnits * facts.costCents),
      valueAtCost: fromCents(value(projectedQuantity, facts.costCents)),
      valueAtPrice: fromCents(value(projectedQuantity, priceCents)),
      marginPerUnit: fromCents(margin(priceCents)),
    },
    demand: demand ? { ...demand, dailyUnits: round(demand.dailyUnits) } : null,
    cover,
    shortfallRisk: cover?.atDelivery !== null && cover?.atDelivery !== undefined ? cover.atDelivery <= 0 : null,
    assumptions,
    uncertainty,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
