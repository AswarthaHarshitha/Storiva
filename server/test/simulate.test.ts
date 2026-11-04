import { describe, expect, it } from "vitest";
import { observedDemand, simulateProduct, toCents, type ProductFacts } from "../src/lib/simulate.js";

const now = new Date("2026-11-05T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const facts = (overrides: Partial<ProductFacts> = {}): ProductFacts => ({
  quantity: 40,
  costCents: toCents("12.50"),
  priceCents: toCents("20.00"),
  issues: [
    { units: 10, at: daysAgo(50) },
    { units: 20, at: daysAgo(30) },
    { units: 15, at: daysAgo(5) },
  ],
  historyStart: daysAgo(90),
  ...overrides,
});
const none = { extraUnits: 0, demandChangePercent: 0, delayDays: 0, newPriceCents: null };

describe("observedDemand", () => {
  it("averages recorded issues over the observed window", () => {
    expect(observedDemand(facts(), now).demand).toEqual({ dailyUnits: 0.5, units: 45, days: 90, events: 3 });
  });

  it("refuses to estimate from too little history", () => {
    const short = observedDemand(facts({ historyStart: daysAgo(7) }), now);
    expect(short.demand).toBeNull();
    expect(short.why).toMatch(/Only 7 days/);
    expect(observedDemand(facts({ issues: [{ units: 5, at: daysAgo(3) }] }), now).demand).toBeNull();
    expect(observedDemand(facts({ historyStart: null }), now).why).toMatch(/no recorded stock history/);
  });
});

describe("simulateProduct", () => {
  it("shows a purchase's quantity, cost and value exactly to the cent", () => {
    const result = simulateProduct(facts(), { ...none, extraUnits: 100 }, now);
    expect(result.actual).toEqual({ quantity: 40, valueAtCost: "500.00", valueAtPrice: "800.00", marginPerUnit: "7.50" });
    expect(result.projected).toMatchObject({ quantity: 140, purchaseCost: "1250.00", valueAtCost: "1750.00", valueAtPrice: "2800.00" });
  });

  it("projects days of cover and a stockout date from recorded demand", () => {
    const result = simulateProduct(facts(), none, now);
    expect(result.cover).toMatchObject({ current: 80, projected: 80, stockoutDate: "2027-01-24" });
  });

  it("applies a demand increase", () => {
    const result = simulateProduct(facts(), { ...none, demandChangePercent: 20 }, now);
    expect(result.cover?.adjustedDailyUnits).toBe(0.6);
    expect(result.cover?.projected).toBeCloseTo(66.7, 1);
    expect(result.assumptions.join(" ")).toMatch(/changed by \+20%/);
  });

  it("estimates stock left when a delivery is delayed and flags a shortfall", () => {
    const fine = simulateProduct(facts(), { ...none, delayDays: 30 }, now);
    expect(fine.cover?.atDelivery).toBe(25);
    expect(fine.shortfallRisk).toBe(false);
    const short = simulateProduct(facts({ quantity: 10 }), { ...none, delayDays: 30 }, now);
    expect(short.shortfallRisk).toBe(true);
  });

  it("recalculates margin and value for a new selling price", () => {
    const result = simulateProduct(facts(), { ...none, newPriceCents: toCents("18.00") }, now);
    expect(result.projected).toMatchObject({ marginPerUnit: "5.50", valueAtPrice: "720.00" });
    expect(result.actual.marginPerUnit).toBe("7.50");
  });

  it("does not project demand-based figures without enough history, and says why", () => {
    const result = simulateProduct(facts({ historyStart: daysAgo(3) }), { ...none, delayDays: 10 }, now);
    expect(result.cover).toBeNull();
    expect(result.shortfallRisk).toBeNull();
    expect(result.uncertainty.join(" ")).toMatch(/Demand-based figures are not shown/);
  });

  it("leaves money figures empty when prices are unknown", () => {
    const result = simulateProduct(facts({ costCents: null, priceCents: null }), { ...none, extraUnits: 5 }, now);
    expect(result.projected).toMatchObject({ purchaseCost: null, valueAtCost: null, valueAtPrice: null, marginPerUnit: null });
    expect(result.uncertainty.join(" ")).toMatch(/No cost price/);
  });
});
