import { describe, expect, it } from "vitest";
import { offlineCodeKeys, syncOutcome } from "./sync";

describe("syncOutcome", () => {
  it.each([
    [201, null, "synced"],
    [200, null, "synced"],
    [0, "NETWORK", "pending"],
    [503, null, "pending"],
    [429, "RATE_LIMITED", "pending"],
    [401, "UNAUTHENTICATED", "pending"],
    [409, "QUANTITY_CHANGED", "conflict"],
    [422, "INSUFFICIENT_STOCK", "failed"],
    [404, "NOT_FOUND", "failed"],
    [409, "IDEMPOTENCY_KEY_REUSED", "failed"],
  ] as const)("HTTP %i %s → %s", (status, code, expected) => {
    expect(syncOutcome(status, code)).toBe(expected);
  });
});

describe("offlineCodeKeys", () => {
  it("covers the forms a barcode is stored in", () => {
    expect(offlineCodeKeys("036000291452")).toContain("0036000291452");
    expect(offlineCodeKeys("00036000291452")).toContain("0036000291452");
    expect(offlineCodeKeys(" ELEC-001 ")).toContain("elec-001");
  });
});
