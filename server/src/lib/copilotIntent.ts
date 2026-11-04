/**
 * Understands the Copilot's supported requests with fixed patterns, so its behaviour is
 * predictable and testable. It never changes anything itself: requests to change stock become
 * proposals that the person must confirm.
 */

export type Intent =
  | { kind: "change"; productText: string; direction: "in" | "out"; quantity: number }
  | { kind: "set"; productText: string; quantity: number }
  | { kind: "history"; productText: string }
  | { kind: "adjustment_history" }
  | { kind: "low_stock" }
  | { kind: "replenish" }
  | { kind: "unverified" }
  | { kind: "top_value" }
  | { kind: "total_value" }
  | { kind: "unusual" }
  | { kind: "help" };

const clean = (text: string) =>
  text
    .replace(/\b(the|my|our|stock|inventory|quantity|units?|pcs|pieces|items?|of)\b/gi, " ")
    .replace(/[?.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const n = (text: string) => Number(text);
/** A regex group that the pattern guarantees is present. */
const at = (m: RegExpExecArray, i: number) => m[i] ?? "";

export function parseIntent(input: string): Intent {
  const text = input.trim().replace(/\s+/g, " ").replace(/^(please|can you|could you|kindly)\s+/i, "");
  let m: RegExpExecArray | null;

  // Changes: "increase wireless mouse stock by 10", "add 10 wireless mouse", "remove 2 of X"
  if ((m = /^(increase|add|raise|top up|restock|receive)\s+(.+?)\s+by\s+(\d{1,9})\b/i.exec(text))) {
    return { kind: "change", productText: clean(at(m, 2)), direction: "in", quantity: n(at(m, 3)) };
  }
  if ((m = /^(decrease|reduce|lower|remove|deduct|issue)\s+(.+?)\s+by\s+(\d{1,9})\b/i.exec(text))) {
    return { kind: "change", productText: clean(at(m, 2)), direction: "out", quantity: n(at(m, 3)) };
  }
  if ((m = /^(add|receive|restock)\s+(\d{1,9})\s+(.+)$/i.exec(text))) {
    return { kind: "change", productText: clean(at(m, 3).replace(/\bto\s+stock$/i, "")), direction: "in", quantity: n(at(m, 2)) };
  }
  if ((m = /^(remove|issue|deduct|take out|sold|sell)\s+(\d{1,9})\s+(.+)$/i.exec(text))) {
    return { kind: "change", productText: clean(at(m, 3).replace(/\bfrom\s+stock$/i, "")), direction: "out", quantity: n(at(m, 2)) };
  }
  if ((m = /^set\s+(?:the\s+)?(?:stock|quantity|count)\s+(?:of|for)\s+(.+?)\s+to\s+(\d{1,9})\b/i.exec(text)) ||
      (m = /^set\s+(.+?)\s+to\s+(\d{1,9})\b/i.exec(text))) {
    return { kind: "set", productText: clean(at(m, 1)), quantity: n(at(m, 2)) };
  }

  // Checked before "adjustment history" so "unusual stock adjustments" is not read as a history request.
  if (/\bunusual\b|\bsuspicious\b|\banomal|\brepeated\s+(?:discrepanc|adjustment|correction)|\bdiscrepanc/i.test(text)) return { kind: "unusual" };
  if (/\badjustment(s)?\b.*\bhistory\b|\bhistory\b.*\badjustment|\b(recent|stock)\s+(adjustments|changes)\b/i.test(text)) return { kind: "adjustment_history" };
  if ((m = /\b(?:history|movements|changes)\s+(?:of|for)\s+(.+)$/i.exec(text))) return { kind: "history", productText: clean(at(m, 1)) };
  if (/\bnot\s+(?:been\s+)?(?:physically\s+)?(?:verified|counted)\b|\bunverified\b|\bnever\s+(?:been\s+)?counted\b|\bneed(?:s)?\s+(?:counting|verification|to be counted)\b/i.test(text)) return { kind: "unverified" };
  if (/\breplenish|\breorder|\bre-order|\bneed(?:s)?\s+(?:to be\s+)?(?:re)?(?:ordered|stocked|restocked)|\bwhat should i (?:buy|order)/i.test(text)) return { kind: "replenish" };
  if (/\b(?:highest|most valuable|biggest|top)\b.*\bvalue\b|\bmost valuable\b/i.test(text)) return { kind: "top_value" };
  if (/\b(?:how much|total)\b.*\b(?:inventory|stock)?\s*value\b|\bvalue of (?:my |the )?(?:inventory|stock)\b|\btied up\b/i.test(text)) return { kind: "total_value" };
  if (/\blow\b|\brunning (?:low|out)\b|\bout of stock\b|\blowest\b/i.test(text)) return { kind: "low_stock" };
  return { kind: "help" };
}
