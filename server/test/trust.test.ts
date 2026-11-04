import { describe, expect, it } from "vitest";
import { assessTrust, type LedgerEntry } from "../src/lib/trust.js";

const now = new Date("2026-11-05T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const entry = (type: LedgerEntry["type"], before: number, after: number, days: number): LedgerEntry => ({
  type,
  quantityBefore: before,
  quantityChange: after - before,
  quantityAfter: after,
  createdAt: daysAgo(days),
});

describe("assessTrust", () => {
  it("is unverified when the product has never been counted", () => {
    const result = assessTrust(12, [entry("create", 0, 12, 40)], now);
    expect(result).toMatchObject({ level: "unverified", lastCount: null, daysSinceCount: null });
    expect(result.reasons[0]).toMatch(/never been physically counted/);
    expect(result.recommendation).toMatch(/Count it/);
  });

  it("is unverified with no history at all, without inventing any", () => {
    const result = assessTrust(5, [], now);
    expect(result.level).toBe("unverified");
    expect(result.changesSinceCount).toBe(0);
  });

  it("is high after a recent count that matched, with no corrections since", () => {
    const result = assessTrust(35, [entry("create", 0, 30, 20), entry("receive", 30, 35, 10), entry("count", 35, 35, 2)], now);
    expect(result).toMatchObject({ level: "high", daysSinceCount: 2, unresolvedDifference: null });
    expect(result.lastCount).toMatchObject({ countedQuantity: 35, difference: 0 });
    expect(result.reasons.join(" ")).toMatch(/Counted 2 days ago.*No unexplained changes/);
  });

  it("is medium when the last count is ageing", () => {
    expect(assessTrust(10, [entry("count", 10, 10, 45)], now).level).toBe("medium");
  });

  it("is low when the last count is stale", () => {
    const result = assessTrust(10, [entry("count", 10, 10, 120)], now);
    expect(result.level).toBe("low");
    expect(result.reasons[0]).toMatch(/120 days ago/);
  });

  it("is low while the last count's difference has not been re-checked", () => {
    const result = assessTrust(38, [entry("count", 42, 38, 3)], now);
    expect(result).toMatchObject({ level: "low", unresolvedDifference: -4 });
    expect(result.recommendation).toMatch(/Recount/);
  });

  it("clears the unresolved difference once a later count confirms the quantity", () => {
    const result = assessTrust(38, [entry("count", 42, 38, 5), entry("count", 38, 38, 1)], now);
    expect(result.unresolvedDifference).toBeNull();
    expect(result.level).toBe("high");
  });

  it("counts manual corrections since the last count", () => {
    const one = assessTrust(9, [entry("count", 10, 10, 2), entry("adjust", 10, 9, 1)], now);
    expect(one).toMatchObject({ level: "medium", correctionsSinceCount: 1 });
    const many = assessTrust(6, [entry("count", 10, 10, 5), entry("adjust", 10, 9, 4), entry("edit", 9, 7, 3), entry("adjust", 7, 6, 1)], now);
    expect(many).toMatchObject({ level: "low", correctionsSinceCount: 3 });
  });

  it("does not count receipts and issues as corrections", () => {
    const result = assessTrust(12, [entry("count", 10, 10, 2), entry("receive", 10, 15, 1), entry("issue", 15, 12, 1)], now);
    expect(result).toMatchObject({ level: "high", correctionsSinceCount: 0, changesSinceCount: 2 });
  });

  it("flags repeated differences across recent counts", () => {
    const history = [entry("count", 10, 9, 60), entry("count", 9, 7, 40), entry("count", 7, 6, 20), entry("count", 6, 6, 2)];
    const result = assessTrust(6, history, now);
    expect(result.countsWithDifference).toBe(3);
    expect(result.level).toBe("low");
    expect(result.reasons.join(" ")).toMatch(/3 of the last 4 counts found a difference/);
  });

  it("is deterministic", () => {
    const history = [entry("create", 0, 5, 30), entry("count", 5, 4, 3)];
    expect(assessTrust(4, history, now)).toEqual(assessTrust(4, history, now));
  });
});
