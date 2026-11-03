import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const server = createApp().listen(env.PORT, () => {
  console.log(`StockFlow API listening on port ${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
