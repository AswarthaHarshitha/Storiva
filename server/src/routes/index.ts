import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import * as auth from "../controllers/authController.js";
import * as dashboard from "../controllers/dashboardController.js";
import * as products from "../controllers/productController.js";
import * as settings from "../controllers/settingsController.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Slows down password guessing and mass sign-ups from a single address.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." } },
});

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
