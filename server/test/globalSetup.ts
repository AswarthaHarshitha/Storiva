import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.DATABASE_URL ?? "";
  // Each test truncates every table; never let the suite point at a database holding real data.
  if (!/_test(\?|$)/.test(url)) {
    throw new Error("Tests must run against a database whose name ends in _test (see server/.env.test).");
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
}
