import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, signUpAgent } from "./helpers.js";

describe("API conventions", () => {
  it("reports health", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body).toEqual({ data: { status: "ok" } });
  });

  it("answers unknown endpoints with a JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON with a 400 in the standard error format", async () => {
    const { agent } = await signUpAgent();
    const res = await agent.post("/api/products").set("Content-Type", "application/json").send('{"name": ').expect(400);
    expect(res.body.error).toEqual({ code: "BAD_REQUEST", message: "The request body could not be read." });
  });

  it("rejects bodies over the size limit", async () => {
    const { agent } = await signUpAgent();
    await agent.post("/api/products").send({ name: "x".repeat(25_000) }).expect(413);
  });

  it("never caches API responses", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("content security policy", () => {
  it("allows WebAssembly from this origin for the scanner but no other script sources", async () => {
    const res = await request(app).get("/api/health");
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval'(;|$)/);
    expect(csp).toContain("default-src 'self'");
  });
});
