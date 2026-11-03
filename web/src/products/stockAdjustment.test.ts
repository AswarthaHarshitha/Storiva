import { describe, expect, it } from "vitest";
import { planAdjustment } from "./stockAdjustment";

describe("planAdjustment", () => {
  it("adds and removes units", () => {
    expect(planAdjustment(10, "add", "5")).toEqual({ delta: 5, resulting: 15, error: null });
    expect(planAdjustment(10, "remove", " 4 ")).toEqual({ delta: -4, resulting: 6, error: null });
  });

  it("allows removing every unit", () => {
    expect(planAdjustment(3, "remove", "3")).toEqual({ delta: -3, resulting: 0, error: null });
  });

  it("refuses to go below zero but still reports the shortfall", () => {
    expect(planAdjustment(3, "remove", "5")).toEqual({ delta: -5, resulting: -2, error: "You can remove at most 3 units." });
  });

  it.each([
    ["", "Enter how many units."],
    ["0", "Enter at least 1 unit."],
    ["-2", "Enter a whole number of units."],
    ["1.5", "Enter a whole number of units."],
    ["ten", "Enter a whole number of units."],
    ["1000000001", "That change is too large."],
  ])("rejects %j", (input, error) => {
    expect(planAdjustment(10, "add", input)).toEqual({ delta: null, resulting: null, error });
  });
});
