import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { env, isProduction } from "./config/env.js";
import { apiNotFound, errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

// The built web app, served by this same process in production. Same origin means the
// session cookie needs no CORS or third-party-cookie allowances, so none are configured.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // The hosting proxies terminate TLS; trusting exactly their hops gives the real client IP,
  // which the login rate limiter relies on.
  if (isProduction) app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", apiRouter);
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
