import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/lib/copilotIntent.js";

describe("parseIntent", () => {
  it.each([
    ["Increase wireless mouse stock by 10", { kind: "change", productText: "wireless mouse", direction: "in", quantity: 10 }],
    ["please add 5 units of USB-C cable 1m", { kind: "change", productText: "USB-C cable 1m", direction: "in", quantity: 5 }],
    ["Reduce the stapler by 2", { kind: "change", productText: "stapler", direction: "out", quantity: 2 }],
    ["remove 3 desk organizer from stock", { kind: "change", productText: "desk organizer", direction: "out", quantity: 3 }],
    ["Set the stock of HDMI cable 2m to 20", { kind: "set", productText: "HDMI cable 2m", quantity: 20 }],
    ["set gel pen set to 0", { kind: "set", productText: "gel pen set", quantity: 0 }],
  ])("understands %j", (text, intent) => {
    expect(parseIntent(text)).toEqual(intent);
  });

  it.each([
    ["Which products are running low?", "low_stock"],
    ["What is out of stock", "low_stock"],
    ["Which products have not been physically verified recently?", "unverified"],
    ["Which products have the highest inventory value?", "top_value"],
    ["How much inventory value do I hold?", "total_value"],
    ["Which products have unusual stock adjustments?", "unusual"],
    ["Which products have repeated discrepancies?", "unusual"],
    ["Which products need replenishment?", "replenish"],
    ["Show my stock adjustment history", "adjustment_history"],
    ["what is the meaning of life", "help"],
  ])("classifies %j", (text, kind) => {
    expect(parseIntent(text).kind).toBe(kind);
  });

  it("reads the product for a history request", () => {
    expect(parseIntent("show history for Wireless Optical Mouse")).toEqual({ kind: "history", productText: "Wireless Optical Mouse" });
  });
});
