import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { prisma } from "../src/lib/prisma.js";
import { productInput, signUpAgent } from "./helpers.js";

let a: TestAgent;
let emailA: string;
let product: { id: string };

beforeEach(async () => {
  ({ agent: a, email: emailA } = await signUpAgent("Org A"));
  product = (await a.post("/api/products").send(productInput({ quantityOnHand: 12 })).expect(201)).body.data;
});

const operate = (agent: TestAgent, body: Record<string, unknown>) =>
  agent.post("/api/stock/operations").send({ productId: product.id, idempotencyKey: randomUUID(), ...body });
const quantity = async () => (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).quantityOnHand;
const ledger = () => prisma.stockMovement.findMany({ where: { productId: product.id }, orderBy: { createdAt: "asc" } });

describe("receive", () => {
  it("adds units and records the movement with its source", async () => {
    const res = await operate(a, { type: "receive", quantity: 8, source: "camera", note: "Delivery 114" }).expect(201);
    expect(res.body.data.product.quantityOnHand).toBe(20);
    expect(res.body.data.movement).toMatchObject({
      type: "receive",
      source: "camera",
      quantityBefore: 12,
      quantityChange: 8,
      quantityAfter: 20,
      note: "Delivery 114",
      user: emailA,
    });
    expect(res.body.data.replayed).toBe(false);
    expect(await quantity()).toBe(20);
  });

  it.each([[0], [-3], [1.5], ["4"]])("rejects quantity %j", async (value) => {
    await operate(a, { type: "receive", quantity: value }).expect(422);
    expect(await quantity()).toBe(12);
  });
});

describe("issue", () => {
  it("removes units", async () => {
    const res = await operate(a, { type: "issue", quantity: 3, source: "scanner" }).expect(201);
    expect(res.body.data.movement).toMatchObject({ quantityBefore: 12, quantityChange: -3, quantityAfter: 9, source: "scanner" });
    expect(await quantity()).toBe(9);
  });

  it("can remove every unit but never more", async () => {
    await operate(a, { type: "issue", quantity: 12 }).expect(201);
    const res = await operate(a, { type: "issue", quantity: 1 }).expect(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await quantity()).toBe(0);
  });
});

describe("physical count", () => {
  it("sets the counted quantity and records the difference", async () => {
    const res = await operate(a, { type: "count", countedQuantity: 10, expectedQuantity: 12 }).expect(201);
    expect(res.body.data.movement).toMatchObject({ type: "count", quantityBefore: 12, quantityChange: -2, quantityAfter: 10 });
    expect(await quantity()).toBe(10);
  });

  it("records a count that confirms the system quantity", async () => {
    const res = await operate(a, { type: "count", countedQuantity: 12, expectedQuantity: 12 }).expect(201);
    expect(res.body.data.movement.quantityChange).toBe(0);
  });

  it("refuses to overwrite a quantity that changed after it was displayed", async () => {
    await operate(a, { type: "issue", quantity: 2 }).expect(201); // someone else issues stock meanwhile
    const res = await operate(a, { type: "count", countedQuantity: 9, expectedQuantity: 12 }).expect(409);
    expect(res.body.error.code).toBe("QUANTITY_CHANGED");
    expect(res.body.error.fields.expectedQuantity).toBe("10");
    expect(await quantity()).toBe(10);
  });

  it("rejects a negative count", async () => {
    await operate(a, { type: "count", countedQuantity: -1, expectedQuantity: 12 }).expect(422);
  });
});

describe("idempotency", () => {
  it("applies a repeated request only once and returns the original result", async () => {
    const key = randomUUID();
    const first = await operate(a, { type: "receive", quantity: 5, idempotencyKey: key }).expect(201);
    const again = await operate(a, { type: "receive", quantity: 5, idempotencyKey: key }).expect(200);
    expect(again.body.data.replayed).toBe(true);
    expect(again.body.data.movement.id).toBe(first.body.data.movement.id);
    expect(await quantity()).toBe(17);
  });

  it("applies simultaneous duplicates exactly once", async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => operate(a, { type: "issue", quantity: 1, idempotencyKey: key })));
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.body.data.replayed === false)).toHaveLength(1);
    expect(await quantity()).toBe(11);
    expect((await ledger()).filter((m) => m.type === "issue")).toHaveLength(1);
  });

  it("refuses to reuse a key for a different product", async () => {
    const other = (await a.post("/api/products").send(productInput({ sku: "OTHER" })).expect(201)).body.data;
    const key = randomUUID();
    await operate(a, { type: "receive", quantity: 1, idempotencyKey: key }).expect(201);
    await a
      .post("/api/stock/operations")
      .send({ productId: other.id, type: "receive", quantity: 1, idempotencyKey: key })
      .expect(409);
  });

  it("requires a well-formed key", async () => {
    await operate(a, { type: "receive", quantity: 1, idempotencyKey: "short" }).expect(422);
    await a.post("/api/stock/operations").send({ productId: product.id, type: "receive", quantity: 1 }).expect(422);
  });
});

describe("concurrency", () => {
  it("serializes simultaneous distinct operations without losing any", async () => {
    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => operate(a, { type: "issue", quantity: 2 })),
      ...Array.from({ length: 5 }, () => operate(a, { type: "receive", quantity: 1 })),
    ]);
    const applied = results.filter((r) => r.status === 201);
    const issued = applied.filter((r) => r.body.data.movement.type === "issue").length;
    const received = applied.filter((r) => r.body.data.movement.type === "receive").length;
    expect(received).toBe(5);
    expect(await quantity()).toBe(12 + received - 2 * issued);
    // Every ledger row continues exactly where the previous one ended.
    const rows = await ledger();
    for (let i = 1; i < rows.length; i++) expect(rows[i]?.quantityBefore).toBe(rows[i - 1]?.quantityAfter);
    expect(rows.at(-1)?.quantityAfter).toBe(await quantity());
  });
});

describe("stock ledger", () => {
  it("records creation, edits and quick adjustments as well as scan operations", async () => {
    await a.put(`/api/products/${product.id}`).send(productInput({ quantityOnHand: 15 })).expect(200);
    await a.put(`/api/products/${product.id}`).send(productInput({ quantityOnHand: 15, name: "Renamed" })).expect(200);
    await a.post(`/api/products/${product.id}/adjust-stock`).send({ delta: -4, note: "Market" }).expect(200);
    await operate(a, { type: "receive", quantity: 2 }).expect(201);
    const rows = await ledger();
    expect(rows.map((m) => [m.type, m.quantityBefore, m.quantityAfter])).toEqual([
      ["create", 0, 12],
      ["edit", 12, 15],
      ["adjust", 15, 11],
      ["receive", 11, 13],
    ]);
  });

  it("lists a product's movements newest first", async () => {
    await operate(a, { type: "receive", quantity: 1 }).expect(201);
    await operate(a, { type: "issue", quantity: 2 }).expect(201);
    const res = await a.get(`/api/products/${product.id}/movements`).expect(200);
    expect(res.body.data.map((m: { type: string }) => m.type)).toEqual(["issue", "receive", "create"]);
  });

  it("keeps history readable after the product is deleted", async () => {
    await a.delete(`/api/products/${product.id}`).expect(204);
    const rows = await prisma.stockMovement.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: null, productSku: "TOTE-01", productName: "Canvas tote bag" });
  });

  it("is rejected by the database if its arithmetic is inconsistent", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    await expect(
      prisma.stockMovement.create({
        data: {
          organizationId: org.id,
          productSku: "X",
          productName: "X",
          type: "adjust",
          source: "manual",
          quantityBefore: 5,
          quantityChange: 1,
          quantityAfter: 9,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("stock tenant isolation", () => {
  it("cannot receive, issue or count another organization's product, and leaves no trace", async () => {
    const { agent: b } = await signUpAgent("Org B");
    await operate(b, { type: "receive", quantity: 5 }).expect(404);
    await operate(b, { type: "issue", quantity: 5 }).expect(404);
    await operate(b, { type: "count", countedQuantity: 0, expectedQuantity: 12 }).expect(404);
    expect(await quantity()).toBe(12);
    expect(await ledger()).toHaveLength(1);
  });

  it("cannot read another organization's movements", async () => {
    const { agent: b } = await signUpAgent("Org B");
    await b.get(`/api/products/${product.id}/movements`).expect(404);
  });

  it("scopes idempotency keys to the organization", async () => {
    const { agent: b } = await signUpAgent("Org B");
    const mine = (await b.post("/api/products").send(productInput({ quantityOnHand: 1 })).expect(201)).body.data;
    const key = randomUUID();
    await operate(a, { type: "receive", quantity: 1, idempotencyKey: key }).expect(201);
    const res = await b
      .post("/api/stock/operations")
      .send({ productId: mine.id, type: "receive", quantity: 1, idempotencyKey: key })
      .expect(201);
    expect(res.body.data.replayed).toBe(false);
  });
});
