import { Router } from "express";
import * as auth from "../controllers/authController.js";
import * as dashboard from "../controllers/dashboardController.js";
import * as products from "../controllers/productController.js";
import * as settings from "../controllers/settingsController.js";
import { credentialLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const apiRouter = Router();

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
apiRouter.get("/products/:id", requireAuth, products.show);
apiRouter.put("/products/:id", requireAuth, products.update);
apiRouter.post("/products/:id/adjust-stock", requireAuth, products.adjustStock);
apiRouter.delete("/products/:id", requireAuth, products.remove);

apiRouter.get("/settings", requireAuth, settings.show);
apiRouter.put("/settings", requireAuth, settings.update);
