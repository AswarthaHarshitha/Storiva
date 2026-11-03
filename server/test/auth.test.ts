import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { app, signUpAgent } from "./helpers.js";

const signup = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/auth/signup")
    .send({
      email: "Owner@Example.test",
      password: "secret123",
      confirmPassword: "secret123",
      organizationName: "Corner Shop",
      ...overrides,
    });

describe("signup", () => {
  it("creates a user, an organization and the link between them", async () => {
    const res = await signup().expect(201);

    expect(res.body.data.email).toBe("owner@example.test");
    expect(res.body.data.organization.name).toBe("Corner Shop");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.test" } });
    expect(user.organizationId).toBe(res.body.data.organization.id);
    expect(user.passwordHash).not.toContain("secret123");
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("starts a session in an httpOnly cookie", async () => {
    const res = await signup().expect(201);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/storiva_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await signup().expect(201);
    const res = await signup({ email: "OWNER@example.test", organizationName: "Other" }).expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(await prisma.organization.count()).toBe(1);
  });

  it("validates every field", async () => {
    const res = await signup({ email: "not-an-email", password: "short", confirmPassword: "x", organizationName: " " }).expect(
      422,
    );
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["confirmPassword", "email", "organizationName", "password"]);
  });

  it("requires the confirmation to match", async () => {
    const res = await signup({ confirmPassword: "secret124" }).expect(422);
    expect(res.body.error.fields.confirmPassword).toBe("Passwords do not match.");
  });

  it("requires a letter and a number in the password", async () => {
    const res = await signup({ password: "onlyletters", confirmPassword: "onlyletters" }).expect(422);
    expect(res.body.error.fields.password).toMatch(/letter and one number/);
  });

  it("creates exactly one account and organization when the same email signs up concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => signup()));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.organization.count()).toBe(1);
  });

  it("ignores an organizationId supplied by the client", async () => {
    const { account } = await signUpAgent("Existing");
    const res = await signup({ organizationId: account.organization.id }).expect(201);
    expect(res.body.data.organization.id).not.toBe(account.organization.id);
  });
});

describe("login and logout", () => {
  it("logs in with valid credentials, case-insensitively on email", async () => {
    await signup().expect(201);
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: " OWNER@example.test ", password: "secret123" }).expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data.email).toBe("owner@example.test");
  });

  it("rejects a wrong password and an unknown email with the same response", async () => {
    await signup().expect(201);
    const wrong = await request(app).post("/api/auth/login").send({ email: "owner@example.test", password: "nope12345" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.test", password: "secret123" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("validates login input", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "", password: "" }).expect(422);
    expect(res.body.error.fields).toHaveProperty("email");
    expect(res.body.error.fields).toHaveProperty("password");
  });

  it("rejects the old session token if it is replayed after logout", async () => {
    const res = await signup().expect(201);
    const cookie = String(res.headers["set-cookie"]).split(";")[0] ?? "";
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("revokes the session on logout", async () => {
    const { agent } = await signUpAgent();
    await agent.get("/api/auth/me").expect(200);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("protected routes", () => {
  const routes: [method: "get" | "post" | "put" | "delete", path: string][] = [
    ["get", "/api/auth/me"],
    ["get", "/api/dashboard"],
    ["get", "/api/products"],
    ["post", "/api/products"],
    ["get", "/api/products/00000000-0000-0000-0000-000000000000"],
    ["put", "/api/products/00000000-0000-0000-0000-000000000000"],
    ["post", "/api/products/00000000-0000-0000-0000-000000000000/adjust-stock"],
    ["delete", "/api/products/00000000-0000-0000-0000-000000000000"],
    ["get", "/api/settings"],
    ["put", "/api/settings"],
  ];

  it.each(routes)("%s %s requires a session", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a forged session cookie", async () => {
    await request(app).get("/api/dashboard").set("Cookie", "storiva_session=forged-token").expect(401);
  });

  it("removes a user's expired sessions when they next log in", async () => {
    const { email } = await signUpAgent();
    await request(app).post("/api/auth/login").send({ email, password: "secret123" }).expect(200);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    // A new browser, so no old cookie is presented and revoked by the login itself.
    await request(app).post("/api/auth/login").send({ email, password: "secret123" }).expect(200);
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an expired session", async () => {
    const { agent } = await signUpAgent();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get("/api/dashboard").expect(401);
    expect(await prisma.session.count()).toBe(0);
  });
});
