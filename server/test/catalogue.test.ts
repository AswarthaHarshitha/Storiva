import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createCatalogueService, RequestBudget } from "../src/catalogue/catalogueService.js";
import { ProviderUnavailableError, type CatalogueProvider, type ProviderResult } from "../src/catalogue/types.js";
import { prisma } from "../src/lib/prisma.js";
import { productInput } from "./helpers.js";

// A controllable stand-in for an external catalogue. Test fixtures only; the application uses
// the real providers.
const known: Record<string, ProviderResult> = {
  "3017620422003": {
    status: "found",
    sourceName: "Open Food Facts",
    sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
    product: {
      name: "Nutella",
      brand: "Nutella",
      description: "Hazelnut And Cocoa Spread, 400 g",
      manufacturer: "Ferrero",
      category: "Snacks",
      imageUrl: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg",
    },
  },
};
let calls: string[] = [];
let down = false;
const provider: CatalogueProvider = {
  id: "openfacts",
  name: "Open Food Facts",
  licence: { name: "Open Database License (ODbL)", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
  lookup(gtin) {
    calls.push(gtin);
    if (down) return Promise.reject(new ProviderUnavailableError("down"));
    return Promise.resolve(known[gtin] ?? { status: "not_found" });
  },
};

let clock = Date.parse("2026-11-04T10:00:00Z");
const app = createApp({
  catalogue: createCatalogueService(prisma, [{ provider, budget: new RequestBudget(1000, 60_000) }], () => clock),
}).listen(0);
afterAll(() => {
  app.close();
});

async function signUp(org: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ email: `${org.replace(/\W/g, "").toLowerCase()}-${Date.now()}@example.test`, password: "secret123", confirmPassword: "secret123", organizationName: org })
    .expect(201);
  return agent;
}
const lookup = (agent: ReturnType<typeof request.agent>, code: string, format?: string) =>
  agent.get("/api/catalogue/lookup").query(format ? { code, format } : { code });

let a: ReturnType<typeof request.agent>;
beforeEach(async () => {
  calls = [];
  down = false;
  clock = Date.parse("2026-11-04T10:00:00Z");
  await prisma.catalogueEntry.deleteMany();
  a = await signUp("Catalogue Org A");
});

describe("catalogue lookup", () => {
  it("returns catalogue details for an unknown retail barcode, with source and licence", async () => {
    const res = await lookup(a, "3017620422003").expect(200);
    expect(res.body.data).toMatchObject({
      code: "3017620422003",
      kind: "gtin",
      existing: null,
      checkedCatalogues: true,
      unavailable: [],
      matches: [
        {
          provider: "openfacts",
          sourceName: "Open Food Facts",
          sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
          licence: { name: "Open Database License (ODbL)" },
          name: "Nutella",
          brand: "Nutella",
          manufacturer: "Ferrero",
          category: "Snacks",
        },
      ],
    });
  });

  it("never returns prices or quantities from a catalogue", async () => {
    const res = await lookup(a, "3017620422003").expect(200);
    const match = res.body.data.matches[0];
    for (const field of ["costPrice", "sellingPrice", "quantityOnHand", "lowStockThreshold"]) expect(match).not.toHaveProperty(field);
  });

  it("looks up UPC-A scans by their canonical GTIN-13", async () => {
    await lookup(a, "036000291452", "UPCA").expect(200);
    expect(calls).toEqual(["0036000291452"]);
  });

  it("reports an unknown barcode with no matches", async () => {
    const res = await lookup(a, "4006381333931").expect(200);
    expect(res.body.data).toMatchObject({ existing: null, checkedCatalogues: true, matches: [], unavailable: [] });
  });

  it("stays usable when the catalogue is unavailable, and says so", async () => {
    down = true;
    const res = await lookup(a, "3017620422003").expect(200);
    expect(res.body.data).toMatchObject({
      matches: [],
      unavailable: [{ provider: "openfacts", providerName: "Open Food Facts" }],
    });
  });

  it("does not ask catalogues about internal codes", async () => {
    const res = await lookup(a, "SHELF-77", "Code128").expect(200);
    expect(res.body.data).toMatchObject({ kind: "other", checkedCatalogues: false, matches: [] });
    expect(calls).toEqual([]);
  });

  it("rejects an invalid barcode", async () => {
    const res = await lookup(a, "3017620422004").expect(422);
    expect(res.body.error.code).toBe("INVALID_BARCODE");
    expect(calls).toEqual([]);
  });

  it("requires a session", async () => {
    await request(app).get("/api/catalogue/lookup").query({ code: "3017620422003" }).expect(401);
  });
});

describe("duplicate detection", () => {
  it("returns the organization's existing product instead of querying catalogues", async () => {
    const product = (await a.post("/api/products").send(productInput({ barcodes: ["3017620422003"] })).expect(201)).body.data;
    const res = await lookup(a, "3017620422003").expect(200);
    expect(res.body.data).toMatchObject({ existing: { id: product.id }, checkedCatalogues: false, matches: [] });
    expect(calls).toEqual([]);
  });

  it("does not treat another organization's product as existing", async () => {
    await a.post("/api/products").send(productInput({ barcodes: ["3017620422003"] })).expect(201);
    const b = await signUp("Catalogue Org B");
    const res = await lookup(b, "3017620422003").expect(200);
    expect(res.body.data.existing).toBeNull();
    expect(res.body.data.matches[0].name).toBe("Nutella");
  });
});

describe("caching", () => {
  it("answers repeated lookups from the cache", async () => {
    await lookup(a, "3017620422003").expect(200);
    await lookup(a, "3017620422003").expect(200);
    expect(calls).toEqual(["3017620422003"]);
  });

  it("remembers a not-found answer for a day only", async () => {
    await lookup(a, "4006381333931").expect(200);
    clock += 23 * 60 * 60 * 1000;
    await lookup(a, "4006381333931").expect(200);
    clock += 2 * 60 * 60 * 1000;
    await lookup(a, "4006381333931").expect(200);
    expect(calls).toEqual(["4006381333931", "4006381333931"]);
  });

  it("does not cache failures", async () => {
    down = true;
    await lookup(a, "3017620422003").expect(200);
    down = false;
    const res = await lookup(a, "3017620422003").expect(200);
    expect(res.body.data.matches).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("stores only public catalogue data in the shared cache", async () => {
    await a.post("/api/products").send(productInput({ name: "Private name", barcodes: ["4006381333931"] })).expect(201);
    await lookup(a, "3017620422003").expect(200);
    const rows = await prisma.catalogueEntry.findMany();
    expect(JSON.stringify(rows)).not.toContain("Private name");
    expect(rows.map((r) => r.code)).toEqual(["3017620422003"]);
  });
});

describe("request budget", () => {
  it("reports a provider as unavailable once its budget is spent", async () => {
    const budgeted = createApp({
      catalogue: createCatalogueService(prisma, [{ provider, budget: new RequestBudget(1, 60_000) }], () => clock),
    }).listen(0);
    try {
      const agent = request.agent(budgeted);
      await agent.post("/api/auth/signup").send({ email: `budget-${Date.now()}@example.test`, password: "secret123", confirmPassword: "secret123", organizationName: "Budget" }).expect(201);
      await agent.get("/api/catalogue/lookup").query({ code: "3017620422003" }).expect(200);
      const second = await agent.get("/api/catalogue/lookup").query({ code: "4006381333931" }).expect(200);
      expect(second.body.data.unavailable).toEqual([{ provider: "openfacts", providerName: "Open Food Facts" }]);
      expect(calls).toEqual(["3017620422003"]);
    } finally {
      budgeted.close();
    }
  });
});

describe("creating a product from catalogue details", () => {
  it("stores the details, the source and the barcode, and uses the default threshold", async () => {
    const res = await a
      .post("/api/products")
      .send(
        productInput({
          name: "Nutella",
          sku: "3017620422003",
          quantityOnHand: 6,
          costPrice: null,
          sellingPrice: "4.20",
          barcodes: ["3017620422003"],
          brand: "Nutella",
          manufacturer: "Ferrero",
          category: "Snacks",
          description: "Hazelnut And Cocoa Spread, 400 g",
          imageUrl: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg",
          catalogue: { provider: "openfacts", sourceName: "Open Food Facts", retrievedAt: "2026-11-04T10:00:00.000Z" },
        }),
      )
      .expect(201);
    expect(res.body.data).toMatchObject({
      brand: "Nutella",
      manufacturer: "Ferrero",
      category: "Snacks",
      lowStockThreshold: null,
      effectiveThreshold: 5,
      catalogue: { provider: "openfacts", sourceName: "Open Food Facts", retrievedAt: "2026-11-04T10:00:00.000Z" },
      barcodes: [expect.objectContaining({ code: "3017620422003" })],
    });
  });

  it("keeps the catalogue source when the product is edited", async () => {
    const created = (
      await a
        .post("/api/products")
        .send(productInput({ brand: "B", catalogue: { provider: "openfacts", sourceName: "Open Food Facts", retrievedAt: "2026-11-04T10:00:00.000Z" } }))
        .expect(201)
    ).body.data;
    const res = await a.put(`/api/products/${created.id}`).send(productInput({ brand: "Corrected brand", catalogue: null })).expect(200);
    expect(res.body.data).toMatchObject({ brand: "Corrected brand", catalogue: { provider: "openfacts" } });
  });

  it("accepts manual products without any catalogue details", async () => {
    const res = await a.post("/api/products").send(productInput()).expect(201);
    expect(res.body.data).toMatchObject({ brand: null, imageUrl: null, catalogue: null });
  });

  it("rejects images from anywhere but the catalogue's image servers", async () => {
    const res = await a.post("/api/products").send(productInput({ imageUrl: "https://tracker.example/pixel.gif" })).expect(422);
    expect(res.body.error.fields.imageUrl).toBeDefined();
    await a.post("/api/products").send(productInput({ imageUrl: "http://images.openfoodfacts.org/x.jpg" })).expect(422);
  });

  it("rejects an unknown catalogue source", async () => {
    await a
      .post("/api/products")
      .send(productInput({ catalogue: { provider: "madeup", sourceName: "X", retrievedAt: "2026-11-04T10:00:00.000Z" } }))
      .expect(422);
  });
});
