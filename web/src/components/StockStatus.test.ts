import { describe, expect, it } from "vitest";
import { stockStatus } from "./StockStatus";

describe("stockStatus", () => {
  it("treats zero units as out of stock, even with a zero threshold", () => {
    expect(stockStatus(0, 5)).toBe("out");
    expect(stockStatus(0, 0)).toBe("out");
  });

  it("is low at or below the threshold", () => {
    expect(stockStatus(5, 5)).toBe("low");
    expect(stockStatus(1, 5)).toBe("low");
  });

  it("is in stock above the threshold", () => {
    expect(stockStatus(6, 5)).toBe("ok");
  });
});
