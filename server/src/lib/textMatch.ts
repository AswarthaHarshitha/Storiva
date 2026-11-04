/** Lower-case word tokens, ignoring punctuation and very short noise. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/**
 * Similarity of two product descriptions between 0 and 1: the share of the candidate's words
 * found in the text (Dice coefficient on word sets), with partial credit for words that start
 * the same way (e.g. "headphone" and "headphones").
 */
export function similarity(text: string, candidate: string): number {
  const a = new Set(tokens(text));
  const b = [...new Set(tokens(candidate))];
  if (a.size === 0 || b.length === 0) return 0;
  let shared = 0;
  for (const word of b) {
    if (a.has(word)) shared += 1;
    else if (word.length >= 4 && [...a].some((w) => w.length >= 4 && (w.startsWith(word) || word.startsWith(w)))) shared += 0.75;
  }
  return (2 * shared) / (a.size + b.length);
}

export type MatchConfidence = "exact" | "high" | "medium" | "low";

export interface MatchCandidate {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  barcodes?: string[];
}

export interface Match<T extends MatchCandidate> {
  product: T;
  score: number;
  confidence: MatchConfidence;
  reason: string;
}

/**
 * Ranks products against a piece of text (an invoice line, words read from a photo, a
 * Copilot request). An exact SKU or barcode in the text is a certain match; otherwise the
 * score is word similarity and the confidence label says how much to trust it.
 */
export function rankMatches<T extends MatchCandidate>(text: string, products: T[], limit = 5): Match<T>[] {
  const words = new Set(tokens(text));
  const raw = text.toLowerCase();
  const results: Match<T>[] = [];
  for (const product of products) {
    const sku = product.sku.toLowerCase();
    if (words.has(sku) || (sku.length >= 4 && raw.includes(sku))) {
      results.push({ product, score: 1, confidence: "exact", reason: `SKU ${product.sku} appears in the text` });
      continue;
    }
    const code = product.barcodes?.find((c) => raw.includes(c));
    if (code) {
      results.push({ product, score: 1, confidence: "exact", reason: `Barcode ${code} appears in the text` });
      continue;
    }
    const score = Math.max(similarity(text, product.name), product.brand ? similarity(text, `${product.brand} ${product.name}`) : 0);
    if (score < 0.3) continue;
    const confidence: MatchConfidence = score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
    results.push({ product, score, confidence, reason: `${Math.round(score * 100)}% of the words match "${product.name}"` });
  }
  return results.sort((x, y) => y.score - x.score || x.product.name.localeCompare(y.product.name)).slice(0, limit);
}
