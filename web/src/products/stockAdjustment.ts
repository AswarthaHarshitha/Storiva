import { pluralize } from "../lib/format";

export type Direction = "add" | "remove";

export interface AdjustmentPlan {
  /** Signed change to send to the API, or null while the input is not a valid amount. */
  delta: number | null;
  /** Quantity after the change, or null while the input is not a valid amount. */
  resulting: number | null;
  error: string | null;
}

const MAX_UNITS = 1_000_000_000;

/** Interprets the adjust-stock form; the server applies the same rules again. */
export function planAdjustment(onHand: number, direction: Direction, unitsText: string): AdjustmentPlan {
  const text = unitsText.trim();
  if (text === "") return { delta: null, resulting: null, error: "Enter how many units." };
  if (!/^\d+$/.test(text)) return { delta: null, resulting: null, error: "Enter a whole number of units." };

  const units = Number(text);
  if (units === 0) return { delta: null, resulting: null, error: "Enter at least 1 unit." };
  if (units > MAX_UNITS) return { delta: null, resulting: null, error: "That change is too large." };

  const delta = direction === "add" ? units : -units;
  const resulting = onHand + delta;
  if (resulting < 0) {
    return { delta, resulting, error: `You can remove at most ${pluralize(onHand, "unit")}.` };
  }
  return { delta, resulting, error: null };
}
