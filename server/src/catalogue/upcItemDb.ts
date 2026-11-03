import { clean, ProviderUnavailableError, type CatalogueProvider, type Fetch, type ProviderResult } from "./types.js";

// UPCitemdb's free plan: no sign-up, about 100 lookups a day per server IP. It is disabled
// unless CATALOGUE_PROVIDERS includes "upcitemdb", because its terms for commercial use of the
// free plan have not been confirmed. https://upcitemdb.com/api
// Its product images are hosted by arbitrary retailers, so they are not used.

interface UpcItemDbResponse {
  code?: string;
  items?: { title?: string; description?: string; brand?: string; category?: string }[];
}

export function createUpcItemDbProvider(fetchImpl: Fetch): CatalogueProvider {
  return {
    id: "upcitemdb",
    name: "UPCitemdb",
    licence: null,

    async lookup(gtin, signal): Promise<ProviderResult> {
      let response: Response;
      try {
        response = await fetchImpl(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(gtin)}`, {
          headers: { Accept: "application/json" },
          signal,
        });
      } catch (error) {
        throw new ProviderUnavailableError(error instanceof Error ? error.message : "request failed");
      }
      if (response.status === 404) return { status: "not_found" };
      if (response.status !== 200) throw new ProviderUnavailableError(`HTTP ${response.status}`);
      let body: UpcItemDbResponse;
      try {
        body = (await response.json()) as UpcItemDbResponse;
      } catch {
        throw new ProviderUnavailableError("invalid JSON");
      }
      const item = body.items?.[0];
      if (body.code !== "OK" || !item) return { status: "not_found" };
      const product = {
        name: clean(item.title, 200),
        brand: clean(item.brand, 120),
        description: clean(item.description, 2000),
        manufacturer: null,
        category: clean(item.category?.split(">").at(-1), 200),
        imageUrl: null,
      };
      if (!Object.values(product).some(Boolean)) return { status: "not_found" };
      return { status: "found", product, sourceName: "UPCitemdb", sourceUrl: `https://www.upcitemdb.com/upc/${encodeURIComponent(gtin)}` };
    },
  };
}
