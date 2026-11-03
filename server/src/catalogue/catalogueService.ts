import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderUnavailableError, type CatalogueProduct, type CatalogueProvider } from "./types.js";

const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export interface CatalogueMatch extends CatalogueProduct {
  provider: string;
  providerName: string;
  sourceName: string;
  sourceUrl: string;
  licence: { name: string; url: string } | null;
  retrievedAt: Date;
}

export interface CatalogueLookupResult {
  matches: CatalogueMatch[];
  /** Providers that could not be reached; their absence of a match means nothing. */
  unavailable: { provider: string; providerName: string }[];
}

/** Allows at most `limit` calls per `windowMs`, to stay well inside a provider's published limits. */
export class RequestBudget {
  private calls: number[] = [];
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(now: number): boolean {
    this.calls = this.calls.filter((t) => now - t < this.windowMs);
    if (this.calls.length >= this.limit) return false;
    this.calls.push(now);
    return true;
  }
}

interface ProviderSlot {
  provider: CatalogueProvider;
  budget: RequestBudget;
}

export interface CatalogueService {
  enabled: boolean;
  lookup(gtin: string): Promise<CatalogueLookupResult>;
}

/**
 * Looks a GTIN up in the configured catalogues, in order, stopping at the first match.
 * Answers are cached in catalogue_entries (public data only), so repeated scans of the same
 * code do not repeat external requests. Errors are never cached.
 */
export function createCatalogueService(
  db: PrismaClient,
  slots: ProviderSlot[],
  now: () => number = Date.now,
): CatalogueService {
  return {
    enabled: slots.length > 0,

    async lookup(gtin) {
      const matches: CatalogueMatch[] = [];
      const unavailable: CatalogueLookupResult["unavailable"] = [];

      for (const { provider, budget } of slots) {
        const cached = await db.catalogueEntry.findUnique({ where: { provider_code: { provider: provider.id, code: gtin } } });
        const age = cached ? now() - cached.fetchedAt.getTime() : Infinity;
        if (cached && age < (cached.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) {
          if (cached.found && cached.data) {
            matches.push(toMatch(provider, cached.data as unknown as CatalogueProduct, cached.sourceName, cached.sourceUrl, cached.fetchedAt));
            break;
          }
          continue;
        }

        if (!budget.take(now())) {
          unavailable.push({ provider: provider.id, providerName: provider.name });
          continue;
        }

        try {
          const result = await provider.lookup(gtin, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
          const fetchedAt = new Date(now());
          const entry = {
            found: result.status === "found",
            data: result.status === "found" ? (result.product as unknown as Prisma.InputJsonValue) : undefined,
            sourceName: result.status === "found" ? result.sourceName : null,
            sourceUrl: result.status === "found" ? result.sourceUrl : null,
            fetchedAt,
          };
          await db.catalogueEntry.upsert({
            where: { provider_code: { provider: provider.id, code: gtin } },
            create: { provider: provider.id, code: gtin, ...entry },
            update: entry,
          });
          if (result.status === "found") {
            matches.push(toMatch(provider, result.product, result.sourceName, result.sourceUrl, fetchedAt));
            break;
          }
        } catch (error) {
          if (!(error instanceof ProviderUnavailableError) && !(error instanceof DOMException)) throw error;
          unavailable.push({ provider: provider.id, providerName: provider.name });
        }
      }
      return { matches, unavailable };
    },
  };
}

function toMatch(
  provider: CatalogueProvider,
  product: CatalogueProduct,
  sourceName: string | null,
  sourceUrl: string | null,
  retrievedAt: Date,
): CatalogueMatch {
  return {
    ...product,
    provider: provider.id,
    providerName: provider.name,
    sourceName: sourceName ?? provider.name,
    sourceUrl: sourceUrl ?? "",
    licence: provider.licence,
    retrievedAt,
  };
}
