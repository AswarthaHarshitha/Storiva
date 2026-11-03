import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { prisma } from "../src/lib/prisma.js";
import { productInput, signUpAgent } from "./helpers.js";

describe("tenant isolation", () => {
  let orgA: TestAgent;
  let orgB: TestAgent;
  let productOfB: { id: string };

  beforeEach(async () => {
    orgA = (await signUpAgent("Organization A")).agent;
    orgB = (await signUpAgent("Organization B")).agent;
    await orgA.post("/api/products").send(productInput({ name: "A's lamp", sku: "LAMP-1", quantityOnHand: 7 })).expect(201);
    productOfB = (
      await orgB.post("/api/products").send(productInput({ name: "B's chair", sku: "CHAIR-1", quantityOnHand: 3 })).expect(201)
    ).body.data;
  });

  it("does not list another organization's products", async () => {
    const res = await orgA.get("/api/products").expect(200);
    expect(res.body.data.map((p: { sku: string }) => p.sku)).toEqual(["LAMP-1"]);

    const search = await orgA.get("/api/products").query({ q: "chair" }).expect(200);
    expect(search.body.data).toEqual([]);
  });

  it("cannot read another organization's product by ID", async () => {
    const res = await orgA.get(`/api/products/${productOfB.id}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("cannot update another organization's product", async () => {
    await orgA.put(`/api/products/${productOfB.id}`).send(productInput({ name: "Hijacked", quantityOnHand: 0 })).expect(404);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: productOfB.id } });
    expect(stored.name).toBe("B's chair");
    expect(stored.quantityOnHand).toBe(3);
  });

  it("cannot adjust another organization's stock", async () => {
    await orgA.post(`/api/products/${productOfB.id}/adjust-stock`).send({ delta: -3 }).expect(404);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: productOfB.id } });
    expect(stored.quantityOnHand).toBe(3);
  });

  it("cannot delete another organization's product", async () => {
    await orgA.delete(`/api/products/${productOfB.id}`).expect(404);
    expect(await prisma.product.count({ where: { id: productOfB.id } })).toBe(1);
  });

  it("ignores an organizationId in the request body", async () => {
    const bOrgId = (await prisma.product.findUniqueOrThrow({ where: { id: productOfB.id } })).organizationId;
    const res = await orgA
      .post("/api/products")
      .send({ ...productInput({ sku: "SNEAKY-1" }), organizationId: bOrgId })
      .expect(201);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.organizationId).not.toBe(bOrgId);
    const bList = await orgB.get("/api/products").expect(200);
    expect(bList.body.data.map((p: { sku: string }) => p.sku)).toEqual(["CHAIR-1"]);
  });

  it("allows the same SKU in different organizations", async () => {
    await orgA.post("/api/products").send(productInput({ sku: "CHAIR-1" })).expect(201);
  });

  it("keeps dashboards and settings separate", async () => {
    await orgB.put("/api/settings").send({ defaultLowStockThreshold: 50 }).expect(200);
    const a = await orgA.get("/api/dashboard").expect(200);
    expect(a.body.data).toMatchObject({ totalProducts: 1, totalQuantity: 7, defaultLowStockThreshold: 5, lowStockCount: 0 });
    const b = await orgB.get("/api/dashboard").expect(200);
    expect(b.body.data).toMatchObject({ totalProducts: 1, totalQuantity: 3, defaultLowStockThreshold: 50, lowStockCount: 1 });
  });
});
