import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { productInput, signUpAgent } from "./helpers.js";

let agent: TestAgent;

beforeEach(async () => {
  ({ agent } = await signUpAgent("Harbour Goods"));
});

const create = (overrides: Record<string, unknown>) => agent.post("/api/products").send(productInput(overrides)).expect(201);

describe("dashboard", () => {
  it("starts empty for a new organization", async () => {
    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.data).toEqual({
      organizationName: "Harbour Goods",
      defaultLowStockThreshold: 5,
      totalProducts: 0,
      totalQuantity: 0,
      lowStockCount: 0,
      lowStockItems: [],
    });
  });

  it("totals products and quantity from stored records", async () => {
    await create({ sku: "A", quantityOnHand: 12 });
    await create({ sku: "B", quantityOnHand: 30 });
    await create({ sku: "C", quantityOnHand: 0 });
    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.data).toMatchObject({ totalProducts: 3, totalQuantity: 42 });
  });

  it("flags products at or below their own threshold, else the default", async () => {
    await create({ name: "At own threshold", sku: "OWN-EQ", quantityOnHand: 8, lowStockThreshold: 8 });
    await create({ name: "Above own threshold", sku: "OWN-ABOVE", quantityOnHand: 3, lowStockThreshold: 2 });
    await create({ name: "At default", sku: "DEF-EQ", quantityOnHand: 5 });
    await create({ name: "Above default", sku: "DEF-ABOVE", quantityOnHand: 6 });
    await create({ name: "Out of stock", sku: "ZERO", quantityOnHand: 0 });
    await create({ name: "Zero threshold", sku: "ZERO-T", quantityOnHand: 1, lowStockThreshold: 0 });

    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.data.lowStockCount).toBe(3);
    expect(res.body.data.lowStockItems).toEqual([
      expect.objectContaining({ sku: "ZERO", quantityOnHand: 0, lowStockThreshold: null, effectiveThreshold: 5 }),
      expect.objectContaining({ sku: "DEF-EQ", quantityOnHand: 5, lowStockThreshold: null, effectiveThreshold: 5 }),
      expect.objectContaining({ sku: "OWN-EQ", quantityOnHand: 8, lowStockThreshold: 8, effectiveThreshold: 8 }),
    ]);
  });

  it("reflects stock changes immediately", async () => {
    const { id } = (await create({ sku: "X", quantityOnHand: 20 })).body.data;
    await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: -16 }).expect(200);
    const res = await agent.get("/api/dashboard").expect(200);
    expect(res.body.data).toMatchObject({ totalQuantity: 4, lowStockCount: 1 });
    await agent.delete(`/api/products/${id}`).expect(204);
    const after = await agent.get("/api/dashboard").expect(200);
    expect(after.body.data).toMatchObject({ totalProducts: 0, totalQuantity: 0, lowStockCount: 0 });
  });
});

describe("settings", () => {
  it("defaults to a threshold of 5", async () => {
    const res = await agent.get("/api/settings").expect(200);
    expect(res.body.data).toEqual({ organizationName: "Harbour Goods", defaultLowStockThreshold: 5 });
  });

  it("persists the default threshold and uses it for low-stock calculations", async () => {
    await create({ sku: "NINE", quantityOnHand: 9 });
    await create({ sku: "OWN", quantityOnHand: 9, lowStockThreshold: 1 });
    expect((await agent.get("/api/dashboard")).body.data.lowStockCount).toBe(0);

    await agent.put("/api/settings").send({ defaultLowStockThreshold: 10 }).expect(200);

    expect((await agent.get("/api/settings")).body.data.defaultLowStockThreshold).toBe(10);
    const dashboard = (await agent.get("/api/dashboard")).body.data;
    expect(dashboard.lowStockItems.map((p: { sku: string }) => p.sku)).toEqual(["NINE"]);
    const products = (await agent.get("/api/products")).body.data;
    expect(products.find((p: { sku: string }) => p.sku === "NINE")).toMatchObject({ effectiveThreshold: 10, isLowStock: true });
  });

  it.each([[-1], [2.5], ["7"], [null]])("rejects %j", async (value) => {
    await agent.put("/api/settings").send({ defaultLowStockThreshold: value }).expect(422);
    expect((await agent.get("/api/settings")).body.data.defaultLowStockThreshold).toBe(5);
  });
});
