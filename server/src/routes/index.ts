import { Router } from "express";
import * as adv from "../controllers/advancedController.js";
import * as auth from "../controllers/authController.js";
import * as barcodes from "../controllers/barcodeController.js";
import * as dashboard from "../controllers/dashboardController.js";
import * as products from "../controllers/productController.js";
import * as settings from "../controllers/settingsController.js";
import * as stock from "../controllers/stockController.js";
import type { CatalogueService } from "../catalogue/catalogueService.js";
import { catalogueLookup } from "../controllers/catalogueController.js";
import { catalogueLimiter, copilotLimiter, credentialLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";

/** The API's routes. External services are passed in so tests can replace them. */
export function createApiRouter(catalogue: CatalogueService) {
  const apiRouter = Router();

  apiRouter.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

  apiRouter.post("/auth/signup", credentialLimiter, auth.signup);
  apiRouter.post("/auth/login", credentialLimiter, auth.login);
  apiRouter.post("/auth/logout", auth.logout);
  apiRouter.get("/auth/me", requireAuth, auth.me);

  apiRouter.get("/dashboard", requireAuth, dashboard.show);

  apiRouter.get("/products", requireAuth, products.list);
  apiRouter.post("/products", requireAuth, products.create);
  apiRouter.get("/products/export.csv", requireAuth, adv.exportProducts);
  apiRouter.get("/products/:id", requireAuth, products.show);
  apiRouter.put("/products/:id", requireAuth, products.update);
  apiRouter.post("/products/:id/adjust-stock", requireAuth, products.adjustStock);
  apiRouter.delete("/products/:id", requireAuth, products.remove);
  apiRouter.get("/products/:id/movements", requireAuth, stock.movements);
  apiRouter.post("/products/:id/barcodes", requireAuth, barcodes.attach);
  apiRouter.delete("/products/:id/barcodes/:barcodeId", requireAuth, barcodes.remove);

  apiRouter.get("/barcodes/lookup", requireAuth, barcodes.lookup);
  apiRouter.post("/stock/operations", requireAuth, stock.apply);
  apiRouter.get("/catalogue/lookup", requireAuth, catalogueLimiter, catalogueLookup(catalogue));

  apiRouter.get("/products/:id/evidence", requireAuth, adv.evidence);
  apiRouter.post("/products/:id/evidence/verify", requireAuth, adv.verifyEvidence);
  apiRouter.get("/products/:id/trust", requireAuth, adv.trustOne);
  apiRouter.post("/imports/preview", requireAuth, adv.importPreview);
  apiRouter.post("/imports", requireAuth, adv.importCommit);

  apiRouter.get("/trust", requireAuth, adv.trust);
  apiRouter.get("/exceptions", requireAuth, adv.exceptions);
  apiRouter.post("/exceptions/sync-failures", requireAuth, adv.syncFailure);
  apiRouter.post("/exceptions/:id/resolve", requireAuth, adv.resolve);
  apiRouter.get("/reports", requireAuth, adv.reports);
  apiRouter.post("/simulate", requireAuth, adv.simulation);

  apiRouter.get("/suppliers", requireAuth, adv.suppliers);
  apiRouter.post("/suppliers", requireAuth, adv.createSupplier);
  apiRouter.put("/suppliers/:id", requireAuth, adv.updateSupplier);
  apiRouter.delete("/suppliers/:id", requireAuth, adv.deleteSupplier);
  apiRouter.get("/receipts", requireAuth, adv.receipts);
  apiRouter.post("/receipts", requireAuth, adv.createReceipt);
  apiRouter.post("/receipts/parse", requireAuth, adv.parseInvoice);
  apiRouter.get("/receipts/:id", requireAuth, adv.receipt);
  apiRouter.put("/receipts/:id", requireAuth, adv.updateReceipt);
  apiRouter.delete("/receipts/:id", requireAuth, adv.deleteReceipt);
  apiRouter.post("/receipts/:id/confirm", requireAuth, adv.confirmReceipt);

  apiRouter.post("/copilot", requireAuth, copilotLimiter, adv.copilot);
  apiRouter.post("/recognize", requireAuth, adv.recognize);

  apiRouter.get("/settings", requireAuth, settings.show);
  apiRouter.put("/settings", requireAuth, settings.update);

  return apiRouter;
}
