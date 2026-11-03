import request from "supertest";
import { afterAll } from "vitest";
import { createApp } from "../src/app.js";

// One listening server per test file; passing the bare app would make supertest start a new
// server for every request.
export const app = createApp().listen(0);

afterAll(() => {
  app.close();
});

let counter = 0;

/** Signs up a fresh account and returns an agent that carries its session cookie. */
export async function signUpAgent(organizationName = "Test Organization") {
  counter += 1;
  const agent = request.agent(app);
  const email = `owner${counter}@storiva.test`;
  const res = await agent
    .post("/api/auth/signup")
    .send({ email, password: "secret123", confirmPassword: "secret123", organizationName })
    .expect(201);
  return { agent, email, account: res.body.data as { id: string; organization: { id: string } } };
}

export const productInput = (overrides: Record<string, unknown> = {}) => ({
  name: "Canvas tote bag",
  sku: "TOTE-01",
  description: null,
  quantityOnHand: 20,
  costPrice: "4.50",
  sellingPrice: "12.00",
  lowStockThreshold: null,
  ...overrides,
});
