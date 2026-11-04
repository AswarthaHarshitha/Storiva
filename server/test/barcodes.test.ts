import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { prisma } from "../src/lib/prisma.js";
import { productInput, signUpAgent } from "./helpers.js";

let a: TestAgent;
let b: TestAgent;

beforeEach(async () => {
  a = (await signUpAgent("Org A")).agent;
  b = (await signUpAgent("Org B")).agent;
});

const create = (agent: TestAgent, overrides: Record<string, unknown> = {}) =>
  agent.post("/api/products").send(productInput(overrides));
const lookup = (agent: TestAgent, code: string, format?: string) =>
  agent.get("/api/barcodes/lookup").query(format ? { code, format } : { code });

describe("creating products with barcodes", () => {
  it("stores normalized barcodes with the product", async () => {
    const res = await create(a, { barcodes: ["036000291452", " STV-0001 "] }).expect(201);
    expect(res.body.data.barcodes).toEqual([
      expect.objectContaining({ code: "0036000291452", kind: "gtin" }),
      expect.objectContaining({ code: "STV-0001", kind: "other" }),
    ]);
  });

  it("rejects an invalid retail barcode and creates nothing", async () => {
    const res = await create(a, { barcodes: ["4006381333932"] }).expect(422);
    expect(res.body.error.fields["barcodes.0"]).toMatch(/check digit/);
    expect(await prisma.product.count()).toBe(0);
  });

  it("rejects a barcode already used in the organization and rolls the product back", async () => {
    await create(a, { barcodes: ["4006381333931"] }).expect(201);
    const res = await create(a, { sku: "OTHER", barcodes: ["4006381333931"] }).expect(409);
    expect(res.body.error.code).toBe("BARCODE_TAKEN");
    expect(res.body.error.fields.barcode).toContain("Canvas tote bag");
    expect(await prisma.product.count()).toBe(1);
  });

  it("treats a UPC-A and its EAN-13 form as the same barcode", async () => {
    await create(a, { barcodes: ["036000291452"] }).expect(201);
    await create(a, { sku: "OTHER", barcodes: ["0036000291452"] }).expect(409);
  });
});

describe("barcode lookup", () => {
  it("finds the product for a registered barcode in any equivalent form", async () => {
    const { id } = (await create(a, { barcodes: ["036000291452"] }).expect(201)).body.data;
    for (const [code, format] of [["036000291452"], ["0036000291452"], ["00036000291452"], ["036000291452", "UPC-A"]] as [
      string,
      string?,
    ][]) {
      const res = await lookup(a, code, format).expect(200);
      expect(res.body.data).toMatchObject({ code: "0036000291452", matchedBy: "barcode", product: { id } });
    }
  });

  it("finds a product by a code equal to its SKU, case-insensitively", async () => {
    const { id } = (await create(a, { sku: "ELEC-001" }).expect(201)).body.data;
    const res = await lookup(a, "elec-001", "Code128").expect(200);
    expect(res.body.data).toMatchObject({ matchedBy: "sku", product: { id } });
  });

  it("reports an unknown barcode without an error", async () => {
    const res = await lookup(a, "4006381333931").expect(200);
    expect(res.body.data).toEqual({ code: "4006381333931", kind: "gtin", matchedBy: null, product: null });
  });

  it("rejects an invalid barcode with a field message", async () => {
    const res = await lookup(a, "4006381333932").expect(422);
    expect(res.body.error.code).toBe("INVALID_BARCODE");
    await lookup(a, "").expect(422);
  });

  it("rejects an unknown format name", async () => {
    await lookup(a, "123", "NotAFormat").expect(422);
  });

  it("requires a session", async () => {
    const { app } = await import("./helpers.js");
    const request = (await import("supertest")).default;
    await request(app).get("/api/barcodes/lookup").query({ code: "4006381333931" }).expect(401);
  });
});

describe("barcode aliases", () => {
  it("lets one product carry several barcodes, each of which finds it", async () => {
    const { id } = (await create(a).expect(201)).body.data;
    await a.post(`/api/products/${id}/barcodes`).send({ code: "4006381333931" }).expect(201);
    await a.post(`/api/products/${id}/barcodes`).send({ code: "SUPPLIER-77", format: "Code128" }).expect(201);
    const res = await a.get(`/api/products/${id}`).expect(200);
    expect(res.body.data.barcodes.map((x: { code: string }) => x.code)).toEqual(["4006381333931", "SUPPLIER-77"]);
    expect((await lookup(a, "SUPPLIER-77").expect(200)).body.data.product.id).toBe(id);
    expect((await lookup(a, "4006381333931").expect(200)).body.data.product.id).toBe(id);
  });

  it("is idempotent when the same barcode is attached to the same product again", async () => {
    const { id } = (await create(a).expect(201)).body.data;
    await a.post(`/api/products/${id}/barcodes`).send({ code: "4006381333931" }).expect(201);
    await a.post(`/api/products/${id}/barcodes`).send({ code: "4006381333931" }).expect(201);
    expect(await prisma.productBarcode.count()).toBe(1);
  });

  it("refuses to move a barcode from one product to another", async () => {
    const first = (await create(a, { barcodes: ["4006381333931"] }).expect(201)).body.data;
    const second = (await create(a, { sku: "OTHER" }).expect(201)).body.data;
    const res = await a.post(`/api/products/${second.id}/barcodes`).send({ code: "4006381333931" }).expect(409);
    expect(res.body.error.fields.barcode).toContain(first.name);
  });

  it("removes a barcode so it no longer finds the product", async () => {
    const product = (await create(a, { barcodes: ["4006381333931"] }).expect(201)).body.data;
    await a.delete(`/api/products/${product.id}/barcodes/${product.barcodes[0].id}`).expect(200);
    expect((await lookup(a, "4006381333931").expect(200)).body.data.product).toBeNull();
  });

  it("deletes a product's barcodes with the product", async () => {
    const { id } = (await create(a, { barcodes: ["4006381333931"] }).expect(201)).body.data;
    await a.delete(`/api/products/${id}`).expect(204);
    expect(await prisma.productBarcode.count()).toBe(0);
  });
});

describe("product search", () => {
  it("finds a product by an exact barcode in any equivalent form", async () => {
    const { id } = (await create(a, { barcodes: ["036000291452"] }).expect(201)).body.data;
    await create(a, { sku: "OTHER", name: "Unrelated" }).expect(201);
    const res = await a.get("/api/products").query({ q: "036000291452" }).expect(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([id]);
  });
});

describe("barcode tenant isolation", () => {
  it("never finds another organization's barcode", async () => {
    await create(a, { barcodes: ["4006381333931"] }).expect(201);
    const res = await lookup(b, "4006381333931").expect(200);
    expect(res.body.data.product).toBeNull();
  });

  it("lets two organizations register the same barcode independently", async () => {
    await create(a, { barcodes: ["4006381333931"] }).expect(201);
    const res = await create(b, { barcodes: ["4006381333931"] }).expect(201);
    expect((await lookup(b, "4006381333931").expect(200)).body.data.product.id).toBe(res.body.data.id);
  });

  it("cannot attach a barcode to, or remove one from, another organization's product", async () => {
    const product = (await create(a, { barcodes: ["4006381333931"] }).expect(201)).body.data;
    await b.post(`/api/products/${product.id}/barcodes`).send({ code: "SNEAKY" }).expect(404);
    await b.delete(`/api/products/${product.id}/barcodes/${product.barcodes[0].id}`).expect(404);
    expect(await prisma.productBarcode.count()).toBe(1);
  });

  it("does not reveal another organization's products through barcode search", async () => {
    await create(a, { barcodes: ["4006381333931"] }).expect(201);
    expect((await b.get("/api/products").query({ q: "4006381333931" }).expect(200)).body.data).toEqual([]);
  });

  it("is enforced by the database even if application checks were bypassed", async () => {
    const product = (await create(a).expect(201)).body.data;
    const orgB = await prisma.organization.findFirstOrThrow({ where: { name: "Org B" } });
    await expect(
      prisma.productBarcode.create({ data: { organizationId: orgB.id, productId: product.id, code: "X1", rawCode: "X1", kind: "other" } }),
    ).rejects.toThrow();
  });
});
