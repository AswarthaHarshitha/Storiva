import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { createCatalogueService, RequestBudget, type CatalogueService } from "./catalogueService.js";
import { createOpenFactsProvider } from "./openFacts.js";
import { createUpcItemDbProvider } from "./upcItemDb.js";

const MINUTE = 60_000;

/** The catalogues named in CATALOGUE_PROVIDERS, in that order. */
export function createConfiguredCatalogue(): CatalogueService {
  const userAgent = `Storiva/1.0 (${env.CATALOGUE_CONTACT})`;
  const slots = env.CATALOGUE_PROVIDERS.map((id) => {
    switch (id) {
      case "openfacts":
        // Published limit: 100 product reads per minute.
        return { provider: createOpenFactsProvider(fetch, userAgent), budget: new RequestBudget(60, MINUTE) };
      case "upcitemdb":
        // Free plan: about 100 lookups a day and a small per-minute burst.
        return { provider: createUpcItemDbProvider(fetch), budget: new RequestBudget(5, MINUTE) };
    }
  });
  return createCatalogueService(prisma, slots);
}
