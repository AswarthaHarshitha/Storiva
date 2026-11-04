import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { isProduction } from "./config/env.js";
import { apiNotFound, errorHandler } from "./middleware/errorHandler.js";
import type { CatalogueService } from "./catalogue/catalogueService.js";
import { createConfiguredCatalogue } from "./catalogue/index.js";
import { OPEN_FACTS_IMAGE_HOSTS } from "./catalogue/openFacts.js";
import { createApiRouter } from "./routes/index.js";

// The built web app, served by this same process in production. Same origin means the
// session cookie needs no CORS or third-party-cookie allowances, so none are configured.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));

export function createApp({ catalogue = createConfiguredCatalogue() }: { catalogue?: CatalogueService } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // The hosting proxy terminates TLS. The rate limiter's client address comes from
  // CLIENT_IP_HEADER (see middleware/rateLimit.ts), not from the proxy-hop count.
  if (isProduction) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // The barcode decoder is WebAssembly served from this origin; compiling it needs
          // 'wasm-unsafe-eval'. No other script sources are allowed.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          // Product photos shown from the public catalogue's image servers.
          imgSrc: ["'self'", "data:", ...OPEN_FACTS_IMAGE_HOSTS.map((host) => `https://${host}`)],
        },
      },
    }),
  );
  // Imports and receipts carry many rows; everything else is small.
  app.use("/api/imports", express.json({ limit: "5mb" }));
  app.use("/api/receipts", express.json({ limit: "256kb" }));
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", createApiRouter(catalogue));
  app.use("/api", apiNotFound);

  if (isProduction && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: "1y", immutable: true }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: webDist });
    });
  }

  app.use(errorHandler);
  return app;
}
