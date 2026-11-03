import type { Request, Response } from "express";
import type { CatalogueService } from "../catalogue/catalogueService.js";
import { normalizeBarcode } from "../lib/barcode.js";
import { HttpError } from "../lib/errors.js";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import { lookupBarcode } from "../services/barcodeService.js";
import { barcodeLookupSchema } from "../validation/stock.js";

/**
 * Identifies a scanned code: first in the caller's own inventory (so an existing product is
 * never offered for creation again), then, for retail barcodes only, in public catalogues.
 */
export const catalogueLookup = (catalogue: CatalogueService) => async (req: Request, res: Response) => {
  const { code, format } = parseInput(barcodeLookupSchema, req.query);
  const normalized = normalizeBarcode(code, format);
  if (!normalized.ok) throw new HttpError(422, "INVALID_BARCODE", normalized.error, { code: normalized.error });

  const own = await lookupBarcode(authOf(req).organizationId, code, format);
  if (own.product) {
    res.json({ data: { code: own.code, kind: own.kind, existing: own.product, checkedCatalogues: false, matches: [], unavailable: [] } });
    return;
  }

  const searchable = normalized.kind === "gtin" && catalogue.enabled;
  const result = searchable ? await catalogue.lookup(normalized.code) : { matches: [], unavailable: [] };
  res.json({ data: { code: own.code, kind: own.kind, existing: null, checkedCatalogues: searchable, ...result } });
};
