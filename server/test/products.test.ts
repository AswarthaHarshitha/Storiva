import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { prisma } from "../src/lib/prisma.js";
import { productInput, signUpAgent } from "./helpers.js";

let agent: TestAgent;
let email: string;

beforeEach(async () => {
  ({ agent, email } = await signUpAgent());
});

const create = (overrides: Record<string, unknown> = {}) => agent.post("/api/products").send(productInput(overrides));

describe("creating products", () => {
  it("stores every field and records who made the change", async () => {
    const res = await create({ description: "Natural cotton", lowStockThreshold: 4 }).expect(201);
    expect(res.body.data).toMatchObject({
      name: "Canvas tote bag",
      sku: "TOTE-01",
      description: "Natural cotton",
      quantityOnHand: 20,
      costPrice: "4.50",
      sellingPrice: "12.00",
      lowStockThreshold: 4,
      effectiveThreshold: 4,
      isLowStock: false,
      lastUpdatedBy: email,
    });
  });

  it("keeps prices exact to the cent", async () => {
    const res = await create({ costPrice: "0.10", sellingPrice: 19.99 }).expect(201);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.costPrice?.toString()).toBe("0.1");
    expect(res.body.data.sellingPrice).toBe("19.99");
  });

  it("treats empty optional fields as not set", async () => {
    const res = await create({ description: "  ", costPrice: "", sellingPrice: null }).expect(201);
    expect(res.body.data).toMatchObject({ description: null, costPrice: null, sellingPrice: null, lowStockThreshold: null });
  });

  it("rejects a duplicate SKU in the same organization, ignoring case", async () => {
    await create().expect(201);
    const res = await create({ name: "Another", sku: "tote-01" }).expect(409);
    expect(res.body.error.code).toBe("SKU_TAKEN");
    expect(res.body.error.fields.sku).toBeDefined();
  });

  it("accepts exactly one of several concurrent creates with the same SKU", async () => {
    const results = await Promise.all(["DUP-1", "dup-1", "Dup-1", "DUP-1"].map((sku) => create({ sku })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await prisma.product.count()).toBe(1);
  });

  it("stores the largest supported price exactly", async () => {
    const res = await create({ sellingPrice: "9999999999.99", costPrice: "0.01" }).expect(201);
    expect(res.body.data).toMatchObject({ sellingPrice: "9999999999.99", costPrice: "0.01" });
  });

  it("accepts a threshold of zero", async () => {
    const res = await create({ lowStockThreshold: 0, quantityOnHand: 0 }).expect(201);
    expect(res.body.data).toMatchObject({ lowStockThreshold: 0, effectiveThreshold: 0, isLowStock: true });
  });

  it.each([
    [{ name: "" }, "name"],
    [{ sku: "" }, "sku"],
    [{ sku: "has spaces" }, "sku"],
    [{ quantityOnHand: -1 }, "quantityOnHand"],
    [{ quantityOnHand: 2.5 }, "quantityOnHand"],
    [{ quantityOnHand: "12" }, "quantityOnHand"],
    [{ quantityOnHand: undefined }, "quantityOnHand"],
    [{ costPrice: "-1" }, "costPrice"],
    [{ sellingPrice: "1.999" }, "sellingPrice"],
    [{ sellingPrice: "abc" }, "sellingPrice"],
    [{ lowStockThreshold: -2 }, "lowStockThreshold"],
    [{ lowStockThreshold: 2.5 }, "lowStockThreshold"],
    [{ sellingPrice: "10000000000" }, "sellingPrice"],
    [{ quantityOnHand: 1_000_000_001 }, "quantityOnHand"],
  ])("rejects %j", async (overrides, field) => {
    const res = await create(overrides).expect(422);
    expect(res.body.error.fields).toHaveProperty(field);
    expect(await prisma.product.count()).toBe(0);
  });
});

describe("listing and searching", () => {
  beforeEach(async () => {
    await create({ name: "Linen napkin", sku: "NAP-200", quantityOnHand: 2 }).expect(201);
    await create({ name: "Ceramic mug", sku: "MUG-100", quantityOnHand: 30 }).expect(201);
    await create({ name: "Mug coaster", sku: "COA-300", quantityOnHand: 9 }).expect(201);
  });

  it("lists products alphabetically with low-stock status", async () => {
    const res = await agent.get("/api/products").expect(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(["Ceramic mug", "Linen napkin", "Mug coaster"]);
    expect(res.body.data.map((p: { isLowStock: boolean }) => p.isLowStock)).toEqual([false, true, false]);
  });

  it("searches by name, case-insensitively", async () => {
    const res = await agent.get("/api/products").query({ q: "MUG" }).expect(200);
    expect(res.body.data.map((p: { sku: string }) => p.sku)).toEqual(["MUG-100", "COA-300"]);
  });

  it("searches by SKU", async () => {
    const res = await agent.get("/api/products").query({ q: "nap-2" }).expect(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(["Linen napkin"]);
  });

  it("returns an empty list when nothing matches", async () => {
    const res = await agent.get("/api/products").query({ q: "zzz" }).expect(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("updating products", () => {
  it("updates every field, including quantity and threshold", async () => {
    const { id } = (await create().expect(201)).body.data;
    const res = await agent
      .put(`/api/products/${id}`)
      .send(productInput({ name: "Tote bag, large", sku: "TOTE-02", quantityOnHand: 3, lowStockThreshold: 3, sellingPrice: "14.25" }))
      .expect(200);
    expect(res.body.data).toMatchObject({
      name: "Tote bag, large",
      sku: "TOTE-02",
      quantityOnHand: 3,
      lowStockThreshold: 3,
      sellingPrice: "14.25",
      isLowStock: true,
    });
    const fetched = await agent.get(`/api/products/${id}`).expect(200);
    expect(fetched.body.data.quantityOnHand).toBe(3);
  });

  it("allows keeping the product's own SKU but not taking another's", async () => {
    const first = (await create().expect(201)).body.data;
    await create({ sku: "OTHER-1" }).expect(201);
    await agent.put(`/api/products/${first.id}`).send(productInput({ sku: "tote-01" })).expect(200);
    await agent.put(`/api/products/${first.id}`).send(productInput({ sku: "other-1" })).expect(409);
  });

  it("rejects an invalid quantity without changing the product", async () => {
    const { id } = (await create().expect(201)).body.data;
    await agent.put(`/api/products/${id}`).send(productInput({ quantityOnHand: -5 })).expect(422);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).quantityOnHand).toBe(20);
  });

  it("returns 404 for unknown or malformed IDs", async () => {
    await agent.put("/api/products/7b0c2d1e-0000-4000-8000-000000000000").send(productInput()).expect(404);
    await agent.get("/api/products/not-a-uuid").expect(404);
  });
});

describe("adjusting stock", () => {
  it("adds and removes units and keeps the note", async () => {
    const { id } = (await create({ quantityOnHand: 10 }).expect(201)).body.data;
    await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: 5, note: "Delivery" }).expect(200);
    const res = await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: -12, note: "Market stall" }).expect(200);
    expect(res.body.data).toMatchObject({ quantityOnHand: 3, lastAdjustmentNote: "Market stall", lastUpdatedBy: email });
  });

  it("refuses to take stock below zero", async () => {
    const { id } = (await create({ quantityOnHand: 2 }).expect(201)).body.data;
    const res = await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: -3 }).expect(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).quantityOnHand).toBe(2);
  });

  it("applies concurrent adjustments without losing any", async () => {
    const { id } = (await create({ quantityOnHand: 10 }).expect(201)).body.data;
    const results = await Promise.all(
      Array.from({ length: 15 }, () => agent.post(`/api/products/${id}/adjust-stock`).send({ delta: -1 })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    expect(results.filter((r) => r.status === 422)).toHaveLength(5);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).quantityOnHand).toBe(0);
  });

  it("rejects zero and fractional changes", async () => {
    const { id } = (await create().expect(201)).body.data;
    await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: 0 }).expect(422);
    await agent.post(`/api/products/${id}/adjust-stock`).send({ delta: 1.5 }).expect(422);
  });
});

describe("deleting products", () => {
  it("deletes the product", async () => {
    const { id } = (await create().expect(201)).body.data;
    await agent.delete(`/api/products/${id}`).expect(204);
    await agent.get(`/api/products/${id}`).expect(404);
    await agent.delete(`/api/products/${id}`).expect(404);
  });
});
