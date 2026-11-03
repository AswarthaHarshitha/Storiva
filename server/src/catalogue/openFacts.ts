import { clean, ProviderUnavailableError, type CatalogueProvider, type Fetch, type ProviderResult } from "./types.js";

// Open Food Facts and its sister projects (Beauty, Products, Pet Food) share one database and
// API. With product_type=all, a request for a product of another type is redirected to the
// right project. Data is community-contributed under the Open Database License.
// API documentation: https://openfoodfacts.github.io/openfoodfacts-server/api

const API_HOST = /^world\.open(food|beauty|products|petfood)facts\.org$/;
export const OPEN_FACTS_IMAGE_HOSTS = [
  "images.openfoodfacts.org",
  "images.openbeautyfacts.org",
  "images.openproductsfacts.org",
  "images.openpetfoodfacts.org",
];

const PROJECT_NAMES: Record<string, string> = {
  food: "Open Food Facts",
  beauty: "Open Beauty Facts",
  product: "Open Products Facts",
  petfood: "Open Pet Food Facts",
};

const FIELDS = "code,product_name,generic_name,brands,brands_owner,categories,quantity,image_front_url,product_type";

interface OpenFactsResponse {
  status?: number;
  product?: Record<string, unknown>;
}

function firstListItem(value: unknown, max: number) {
  return clean(typeof value === "string" ? value.split(",")[0] : null, max);
}

function safeImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OPEN_FACTS_IMAGE_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createOpenFactsProvider(fetchImpl: Fetch, userAgent: string): CatalogueProvider {
  async function get(url: string, signal: AbortSignal, redirectsLeft = 1): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, redirect: "manual", signal });
    } catch (error) {
      throw new ProviderUnavailableError(error instanceof Error ? error.message : "request failed");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location ? new URL(location, url) : null;
      if (!next || redirectsLeft === 0 || next.protocol !== "https:" || !API_HOST.test(next.hostname)) {
        throw new ProviderUnavailableError("unexpected redirect");
      }
      return get(next.toString(), signal, redirectsLeft - 1);
    }
    return response;
  }

  return {
    id: "openfacts",
    name: "Open Food Facts",
    licence: { name: "Open Database License (ODbL)", url: "https://opendatacommons.org/licenses/odbl/1-0/" },

    async lookup(gtin, signal): Promise<ProviderResult> {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json?product_type=all&fields=${FIELDS}`;
      const response = await get(url, signal);
      // Not found is reported as HTTP 404 (or 200) with status 0.
      if (response.status !== 200 && response.status !== 404) {
        throw new ProviderUnavailableError(`HTTP ${response.status}`);
      }
      let body: OpenFactsResponse;
      try {
        body = (await response.json()) as OpenFactsResponse;
      } catch {
        throw new ProviderUnavailableError("invalid JSON");
      }
      const p = body.product;
      if (body.status !== 1 || !p) return { status: "not_found" };

      const name = clean(p.product_name, 200);
      const product = {
        name,
        brand: firstListItem(p.brands, 120),
        description: clean([p.generic_name, p.quantity].filter((x) => typeof x === "string" && x.trim()).join(", "), 2000),
        manufacturer: clean(p.brands_owner, 200),
        category: firstListItem(p.categories, 200),
        imageUrl: safeImage(p.image_front_url),
      };
      if (!Object.values(product).some(Boolean)) return { status: "not_found" };

      const sourceName = PROJECT_NAMES[typeof p.product_type === "string" ? p.product_type : "food"] ?? "Open Food Facts";
      return { status: "found", product, sourceName, sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(gtin)}` };
    },
  };
}
