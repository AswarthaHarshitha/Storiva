/** Product facts a public catalogue may hold for a barcode. Never prices or quantities. */
export interface CatalogueProduct {
  name: string | null;
  brand: string | null;
  description: string | null;
  manufacturer: string | null;
  category: string | null;
  imageUrl: string | null;
}

export type ProviderResult =
  | { status: "found"; product: CatalogueProduct; sourceUrl: string; sourceName: string }
  | { status: "not_found" };

export interface CatalogueProvider {
  id: string;
  name: string;
  licence: { name: string; url: string } | null;
  /** Only retail barcodes (GTINs) are looked up; catalogues do not hold internal codes. */
  lookup(gtin: string, signal: AbortSignal): Promise<ProviderResult>;
}

/** Raised when a provider cannot answer (network error, timeout, rate limit, bad response). */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export type Fetch = typeof fetch;

/** Collapses whitespace and limits length; empty strings become null. */
export function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}
