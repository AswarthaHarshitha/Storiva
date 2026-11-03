import type { CatalogueMatch, CatalogueSource } from "../api/types";
import type { ProductFormValues } from "./validation";

export interface CatalogueDraft {
  values: ProductFormValues;
  imageUrl: string | null;
  /** Recorded with the product so its page can say where the details came from. */
  source: CatalogueSource | null;
  match: CatalogueMatch | null;
}

/**
 * Starting values for a new product with this barcode. Only facts the catalogue returned are
 * filled in; quantity, prices and threshold are always left to the user. The SKU starts as the
 * barcode, which the user can change.
 */
export function draftFromMatch(code: string, match: CatalogueMatch | null): CatalogueDraft {
  return {
    values: {
      barcode: code,
      name: match?.name ?? "",
      sku: code.slice(0, 64),
      description: match?.description ?? "",
      brand: match?.brand ?? "",
      manufacturer: match?.manufacturer ?? "",
      category: match?.category ?? "",
      quantityOnHand: "",
      lowStockThreshold: "",
      costPrice: "",
      sellingPrice: "",
    },
    imageUrl: match?.imageUrl ?? null,
    source: match ? { provider: match.provider, sourceName: match.sourceName, retrievedAt: match.retrievedAt } : null,
    match,
  };
}
