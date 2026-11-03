import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env.test")) process.loadEnvFile(".env.test");

export default defineConfig({
  test: {
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setup.ts"],
    // The suites share one database, so they run one file at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
