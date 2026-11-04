import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type TestAgent from "supertest/lib/agent.js";
import { prisma } from "../src/lib/prisma.js";
import { app, productInput, signUpAgent } from "./helpers.js";

let a: TestAgent;
let b: TestAgent;
beforeEach(async () => {
  a = (await signUpAgent("Org A")).agent;
  b = (await signUpAgent("Org B")).agent;
});
const create = (agent: TestAgent, overrides: Record<string, unknown> = {}) =>
  agent.post("/api/products").send(productInput(overrides)).expect(201).then((r) => r.body.data as { id: string; quantityOnHand: number; sku: string });
const op = (agent: TestAgent, body: Record<string, unknown>) => agent.post("/api/stock/operations").send({ idempotencyKey: randomUUID(), ...body });

describe("adjust operation", () => {
  it("applies a correction against the quantity that was shown", async () => {
    const p = await create(a, { quantityOnHand: 10 });
    const res = await op(a, { productId: p.id, type: "adjust", delta: -3, expectedQuantity: 10, source: "copilot" }).expect(201);
    expect(res.body.data.movement).toMatchObject({ type: "adjust", source: "copilot", quantityBefore: 10, quantityAfter: 7 });
  });

  it("refuses a correction when the quantity changed in the meantime", async () => {
    const p = await create(a, { quantityOnHand: 10 });
    await op(a, { productId: p.id, type: "issue", quantity: 1 }).expect(201);
    const res = await op(a, { productId: p.id, type: "adjust", delta: 5, expectedQuantity: 10 }).expect(409);
    expect(res.body.error.code).toBe("QUANTITY_CHANGED");
  });

  it("does not let clients claim server-only sources", async () => {
    const p = await create(a);
    await op(a, { productId: p.id, type: "receive", quantity: 1, source: "import" }).expect(422);
  });
});

describe("evidence", () => {
  it("records the origin of each field and shows unknown origin for untracked values", async () => {
    const p = await create(a, { costPrice: "4.50", sellingPrice: "12.00" });
    let ev = (await a.get(`/api/products/${p.id}/evidence`).expect(200)).body.data;
    const field = (name: string) => ev.fields.find((f: { field: string }) => f.field === name);
    expect(field("name").origin).toMatchObject({ source: "manual", status: "entered" });
    expect(field("costPrice")).toMatchObject({ value: "4.50", origin: { status: "entered" } });
    expect(field("brand")).toMatchObject({ value: null, origin: null });

    await prisma.product.update({ where: { id: p.id }, data: { sellingPrice: "13.00" } }); // a change outside the app
    ev = (await a.get(`/api/products/${p.id}/evidence`).expect(200)).body.data;
    expect(field("sellingPrice").origin).toBeNull();
  });

  it("records edits and lets a person confirm a value", async () => {
    const p = await create(a);
    await a.put(`/api/products/${p.id}`).send(productInput({ sellingPrice: "15.00" })).expect(200);
    const ev = (await a.post(`/api/products/${p.id}/evidence/verify`).send({ field: "sellingPrice" }).expect(200)).body.data;
    const price = ev.fields.find((f: { field: string }) => f.field === "sellingPrice");
    expect(price.origin).toMatchObject({ status: "verified", source: "manual_check", value: "15.00" });
    expect(price.history.map((h: { status: string }) => h.status)).toEqual(["verified", "entered", "entered"]);
  });

  it("marks quantity verified only by a physical count", async () => {
    const p = await create(a, { quantityOnHand: 8 });
    let ev = (await a.get(`/api/products/${p.id}/evidence`).expect(200)).body.data;
    expect(ev.quantity).toMatchObject({ value: 8, lastCount: null, changesSinceCount: 1 });
    await op(a, { productId: p.id, type: "count", countedQuantity: 7, expectedQuantity: 8 }).expect(201);
    ev = (await a.get(`/api/products/${p.id}/evidence`).expect(200)).body.data;
    expect(ev.quantity.lastCount).toMatchObject({ quantity: 7, difference: -1 });
    expect(ev.quantity.changesSinceCount).toBe(0);
  });

  it("is invisible to other organizations", async () => {
    const p = await create(a);
    await b.get(`/api/products/${p.id}/evidence`).expect(404);
    await b.post(`/api/products/${p.id}/evidence/verify`).send({ field: "name" }).expect(404);
  });
});

describe("trust radar", () => {
  it("assesses every product from its ledger and builds a verification queue", async () => {
    const counted = await create(a, { sku: "COUNTED", quantityOnHand: 5 });
    await create(a, { sku: "NEVER", quantityOnHand: 50 });
    await op(a, { productId: counted.id, type: "count", countedQuantity: 5, expectedQuantity: 5 }).expect(201);
    const res = (await a.get("/api/trust").expect(200)).body.data;
    expect(res.summary).toEqual({ high: 1, medium: 0, low: 0, unverified: 1 });
    expect(res.queue.map((q: { sku: string }) => q.sku)).toEqual(["NEVER"]);
    const one = (await a.get(`/api/products/${counted.id}/trust`).expect(200)).body.data;
    expect(one).toMatchObject({ level: "high", lastCount: { countedQuantity: 5 } });
  });

  it("only includes the caller's products", async () => {
    await create(b, { sku: "B-ONLY" });
    expect((await a.get("/api/trust").expect(200)).body.data.products).toEqual([]);
  });
});

describe("exceptions", () => {
  it("raises a count discrepancy, and closes it when the product is recounted", async () => {
    const p = await create(a, { quantityOnHand: 10 });
    await op(a, { productId: p.id, type: "count", countedQuantity: 8, expectedQuantity: 10 }).expect(201);
    let res = (await a.get("/api/exceptions").expect(200)).body.data;
    const discrepancy = res.exceptions.find((e: { type: string }) => e.type === "count_discrepancy");
    expect(discrepancy).toMatchObject({ title: expect.stringContaining("-2"), product: { id: p.id } });
    expect(discrepancy.detail).toMatchObject({ before: 10, after: 8, recommendation: expect.any(String) });

    await op(a, { productId: p.id, type: "count", countedQuantity: 8, expectedQuantity: 8 }).expect(201);
    res = (await a.get("/api/exceptions").expect(200)).body.data;
    expect(res.exceptions.find((e: { type: string }) => e.type === "count_discrepancy")).toBeUndefined();
  });

  it("flags large manual corrections but not ordinary ones", async () => {
    const p = await create(a, { quantityOnHand: 20 });
    await a.post(`/api/products/${p.id}/adjust-stock`).send({ delta: -1 }).expect(200);
    await a.post(`/api/products/${p.id}/adjust-stock`).send({ delta: -15 }).expect(200);
    const unusual = (await a.get("/api/exceptions").expect(200)).body.data.exceptions.filter((e: { type: string }) => e.type === "unusual_adjustment");
    expect(unusual).toHaveLength(1);
    expect(unusual[0].title).toContain("-15");
  });

  it("groups products never counted into one finding", async () => {
    await create(a, { sku: "X1" });
    await create(a, { sku: "X2" });
    const grouped = (await a.get("/api/exceptions").expect(200)).body.data.exceptions.filter((e: { type: string }) => e.type === "never_counted");
    expect(grouped).toHaveLength(1);
    expect(grouped[0].detail.count).toBe(2);
  });

  it("is resolved with a note, once, and only by its organization", async () => {
    await create(a, { sku: "X1" });
    const [first] = (await a.get("/api/exceptions").expect(200)).body.data.exceptions;
    await b.post(`/api/exceptions/${first.id}/resolve`).send({ status: "resolved", note: "x" }).expect(404);
    await a.post(`/api/exceptions/${first.id}/resolve`).send({ status: "resolved", note: "" }).expect(422);
    await a.post(`/api/exceptions/${first.id}/resolve`).send({ status: "dismissed", note: "Known, counting next week" }).expect(204);
    await a.post(`/api/exceptions/${first.id}/resolve`).send({ status: "resolved", note: "again" }).expect(409);
    const closed = (await a.get("/api/exceptions?status=closed").expect(200)).body.data.exceptions;
    expect(closed[0]).toMatchObject({ status: "dismissed", resolutionNote: "Known, counting next week" });
  });

  it("records offline sync failures reported by a client", async () => {
    const p = await create(a);
    await a.post("/api/exceptions/sync-failures").send({ idempotencyKey: randomUUID(), productId: p.id, productName: "Canvas tote bag", operation: "count", error: "Quantity changed", queuedAt: new Date().toISOString() }).expect(204);
    expect((await a.get("/api/exceptions").expect(200)).body.data.openByType.sync_failure).toBe(1);
    expect((await b.get("/api/exceptions").expect(200)).body.data.openByType.sync_failure).toBeUndefined();
  });
});

describe("suppliers and receiving", () => {
  const receiptBody = (productId: string, overrides: Record<string, unknown> = {}) => ({
    reference: "INV-77",
    expectedDate: "2026-11-01",
    lines: [{ productId, description: "Tote bags", expectedQuantity: 10, receivedQuantity: 9, damagedQuantity: 1, unitCost: "4.10", updateCost: true }],
    ...overrides,
  });

  it("confirms a receipt once: adds usable units, updates cost with documented evidence", async () => {
    const supplier = (await a.post("/api/suppliers").send({ name: "Bright Electricals" }).expect(201)).body.data;
    const p = await create(a, { quantityOnHand: 5, costPrice: "4.50" });
    const draft = (await a.post("/api/receipts").send({ ...receiptBody(p.id), supplierId: supplier.id }).expect(201)).body.data;
    expect(draft.status).toBe("draft");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantityOnHand).toBe(5);

    const confirmed = await Promise.all([a.post(`/api/receipts/${draft.id}/confirm`), a.post(`/api/receipts/${draft.id}/confirm`)]);
    expect(confirmed.map((r) => r.status).sort()).toEqual([200, 409]);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(product.quantityOnHand).toBe(13);
    expect(product.costPrice?.toFixed(2)).toBe("4.10");
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: "receive" } });
    expect(movement).toMatchObject({ source: "receiving", referenceType: "receipt", referenceId: draft.id, quantityChange: 8 });
    const ev = (await a.get(`/api/products/${p.id}/evidence`).expect(200)).body.data;
    expect(ev.fields.find((f: { field: string }) => f.field === "costPrice").origin).toMatchObject({ status: "documented", source: "receipt" });

    const reliability = (await a.get("/api/suppliers").expect(200)).body.data[0].reliability;
    expect(reliability).toMatchObject({ receipts: 1, fillRate: 90, shortLines: 1, damagedRate: 11.1, deliveriesWithDueDate: 1 });
    await a.put(`/api/receipts/${draft.id}`).send(receiptBody(p.id)).expect(409);
    await a.delete(`/api/receipts/${draft.id}`).expect(409);
  });

  it("reports no reliability for a supplier without confirmed receipts", async () => {
    await a.post("/api/suppliers").send({ name: "New supplier" }).expect(201);
    expect((await a.get("/api/suppliers").expect(200)).body.data[0].reliability).toBeNull();
  });

  it("validates receipt lines", async () => {
    const p = await create(a);
    const res = await a.post("/api/receipts").send(receiptBody(p.id, { lines: [{ productId: p.id, description: "x", receivedQuantity: 2, damagedQuantity: 3 }] })).expect(422);
    expect(Object.keys(res.body.error.fields)[0]).toMatch(/damagedQuantity/);
  });

  it("rejects duplicate supplier names regardless of case", async () => {
    await a.post("/api/suppliers").send({ name: "Acme" }).expect(201);
    await a.post("/api/suppliers").send({ name: "ACME" }).expect(409);
    await b.post("/api/suppliers").send({ name: "Acme" }).expect(201);
  });

  it("keeps suppliers and receipts within the organization", async () => {
    const supplier = (await a.post("/api/suppliers").send({ name: "Acme" }).expect(201)).body.data;
    const p = await create(a);
    const draft = (await a.post("/api/receipts").send(receiptBody(p.id)).expect(201)).body.data;
    expect((await b.get("/api/suppliers").expect(200)).body.data).toEqual([]);
    expect((await b.get("/api/receipts").expect(200)).body.data).toEqual([]);
    await b.get(`/api/receipts/${draft.id}`).expect(404);
    await b.post(`/api/receipts/${draft.id}/confirm`).expect(404);
    await b.put(`/api/suppliers/${supplier.id}`).send({ name: "Taken" }).expect(404);
    await b.delete(`/api/suppliers/${supplier.id}`).expect(404);
    // Another organization cannot attach A's product or supplier to its own receipt.
    await b.post("/api/receipts").send(receiptBody(p.id)).expect(422);
    const own = await create(b);
    await b.post("/api/receipts").send({ ...receiptBody(own.id), supplierId: supplier.id }).expect(422);
  });

  it("reads an invoice's text and proposes matches without saving anything", async () => {
    await create(a, { name: "Wireless Optical Mouse", sku: "COMP-001" });
    const res = await a
      .post("/api/receipts/parse")
      .send({ text: "Bright Electricals\nInvoice No: INV-9\nDate: 04/11/2026\nWireless Optical Mouse 10 450.00 4500.00\nGrand Total 4500.00" })
      .expect(200);
    expect(res.body.data).toMatchObject({ invoiceNumber: "INV-9", date: "2026-11-04", total: "4500.00" });
    expect(res.body.data.lines[0].matches[0]).toMatchObject({ sku: "COMP-001", confidence: "high" });
    expect(await prisma.receipt.count()).toBe(0);
  });
});

describe("bulk import and export", () => {
  const rows = [
    { sku: "IMP-1", name: "Imported one", quantity: "5", costPrice: "2.50", barcodes: "4006381333931" },
    { sku: "IMP-2", name: "Imported two", quantity: "0" },
  ];

  it("previews without writing, then imports in one go", async () => {
    const preview = (await a.post("/api/imports/preview").send({ rows }).expect(200)).body.data;
    expect(preview.summary).toMatchObject({ total: 2, create: 2, errors: 0 });
    expect(await prisma.product.count()).toBe(0);

    const result = (await a.post("/api/imports").send({ fileName: "stock.csv", rows }).expect(201)).body.data;
    expect(result.summary.create).toBe(2);
    const imported = await prisma.product.findFirstOrThrow({ where: { sku: "IMP-1" }, include: { barcodes: true } });
    expect(imported).toMatchObject({ quantityOnHand: 5, name: "Imported one" });
    expect(imported.costPrice?.toFixed(2)).toBe("2.50");
    expect(imported.barcodes.map((x) => x.code)).toEqual(["4006381333931"]);
    expect(await prisma.stockMovement.count({ where: { source: "import", referenceId: result.importId } })).toBe(2);
    const ev = (await a.get(`/api/products/${imported.id}/evidence`).expect(200)).body.data;
    expect(ev.fields.find((f: { field: string }) => f.field === "name").origin).toMatchObject({ source: "import", detail: "stock.csv" });
  });

  it("updates existing products by SKU, changing only filled cells, with stock changes in the ledger", async () => {
    const p = await create(a, { sku: "TOTE-01", quantityOnHand: 10, sellingPrice: "12.00" });
    const preview = (await a.post("/api/imports/preview").send({ rows: [{ sku: "tote-01", adjust: "-3", sellingPrice: "13.50" }] }).expect(200)).body.data;
    expect(preview.rows[0]).toMatchObject({ action: "update", quantityDelta: -3 });
    expect(preview.rows[0].changes).toEqual([
      { field: "sellingPrice", from: "12.00", to: "13.50" },
      { field: "quantity", from: "10", to: "7" },
    ]);
    await a.post("/api/imports").send({ rows: [{ sku: "tote-01", adjust: "-3", sellingPrice: "13.50" }] }).expect(201);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.quantityOnHand).toBe(7);
    expect(after.name).toBe("Canvas tote bag");
    expect(await prisma.stockMovement.findFirst({ where: { productId: p.id, type: "adjust", source: "import" } })).toMatchObject({ quantityBefore: 10, quantityAfter: 7 });
  });

  it("reports invalid and duplicate rows, imports the rest, and records the error report", async () => {
    const bad = [
      { sku: "OK-1", name: "Fine" },
      { sku: "OK-1", name: "Duplicate in file" },
      { sku: "", name: "No SKU" },
      { sku: "NEG", name: "Negative", quantity: "-1" },
      { sku: "BOTH", name: "Both", quantity: "1", adjust: "2" },
      { sku: "PRICE", name: "Price", costPrice: "1.999" },
      { sku: "CODE", name: "Bad barcode", barcodes: "4006381333932" },
      { sku: "NEW", name: "New below zero", adjust: "-2" },
    ];
    const preview = (await a.post("/api/imports/preview").send({ rows: bad }).expect(200)).body.data;
    expect(preview.summary).toMatchObject({ create: 1, errors: 7 });
    expect(preview.rows[1].errors[0].message).toMatch(/Duplicate of row 2/);
    const result = (await a.post("/api/imports").send({ fileName: "bad.csv", rows: bad }).expect(201)).body.data;
    expect(result.summary).toMatchObject({ create: 1, errors: 7 });
    expect(await prisma.product.count()).toBe(1);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.importId } });
    expect(batch.skippedCount).toBe(7);
    expect((await a.get("/api/exceptions").expect(200)).body.data.openByType.import_errors).toBe(1);
  });

  it("rejects barcodes that belong to another product", async () => {
    await create(a, { sku: "HAS", barcodes: ["4006381333931"] });
    const preview = (await a.post("/api/imports/preview").send({ rows: [{ sku: "OTHER", name: "X", barcodes: "4006381333931" }] }).expect(200)).body.data;
    expect(preview.rows[0].errors[0].message).toMatch(/already belongs to another product/);
  });

  it("rolls back everything if the import fails part-way", async () => {
    const p = await create(a, { sku: "LOCKED", quantityOnHand: 3 });
    // Force a database error on the second product by making its SKU collide during the write.
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_on_boom() RETURNS trigger AS $$ BEGIN IF NEW.sku = 'BOOM' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_on_boom BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION fail_on_boom()`);
    try {
      await a.post("/api/imports").send({ rows: [{ sku: "LOCKED", adjust: "4" }, { sku: "FINE", name: "Fine" }, { sku: "BOOM", name: "Boom" }] }).expect(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER fail_on_boom ON products`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION fail_on_boom()`);
    }
    expect(await prisma.product.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantityOnHand).toBe(3);
    expect(await prisma.importBatch.count()).toBe(0);
  });

  it("imports 200 products in one request", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ sku: `BULK-${i}`, name: `Bulk item ${i}`, quantity: String(i % 7) }));
    const result = (await a.post("/api/imports").send({ fileName: "many.csv", rows: many }).expect(201)).body.data;
    expect(result.summary.create).toBe(200);
    expect(await prisma.product.count({ where: { sku: { startsWith: "BULK-" } } })).toBe(200);
  });

  it("is limited to the caller's organization in both directions", async () => {
    await create(b, { sku: "B-1", name: "B's product" });
    const preview = (await a.post("/api/imports/preview").send({ rows: [{ sku: "B-1", name: "Mine" }] }).expect(200)).body.data;
    expect(preview.rows[0].action).toBe("create");
    const csv = (await a.get("/api/products/export.csv").expect(200)).text;
    expect(csv).not.toContain("B's product");
  });

  it("exports CSV that round-trips and cannot run spreadsheet formulas", async () => {
    await create(a, { sku: "CSV-1", name: '=HYPERLINK("http://x")', description: 'Says "hi", twice', barcodes: ["4006381333931"] });
    const res = await a.get("/api/products/export.csv").expect(200).expect("Content-Type", /text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="storiva-products-/);
    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toBe("sku,name,barcodes,brand,manufacturer,category,description,quantity,cost_price,selling_price,low_stock_threshold");
    expect(lines[1]).toBe(`CSV-1,"'=HYPERLINK(""http://x"")",4006381333931,,,,"Says ""hi"", twice",20,4.50,12.00,`);
  });

  it("requires a session", async () => {
    await request(app).get("/api/products/export.csv").expect(401);
    await request(app).post("/api/imports").send({ rows }).expect(401);
  });
});

describe("copilot", () => {
  it("answers questions from the organization's data", async () => {
    await create(a, { name: "Low thing", sku: "LOW-1", quantityOnHand: 2 });
    await create(b, { name: "B low thing", sku: "BLOW", quantityOnHand: 0 });
    const res = (await a.post("/api/copilot").send({ message: "Which products are running low?" }).expect(200)).body.data;
    expect(res.intent).toBe("low_stock");
    expect(res.items.map((i: { sku: string }) => i.sku)).toEqual(["LOW-1"]);
  });

  it("turns a change request into a proposal and changes nothing", async () => {
    const p = await create(a, { name: "Wireless Optical Mouse", sku: "COMP-001", quantityOnHand: 35 });
    const res = (await a.post("/api/copilot").send({ message: "Increase wireless optical mouse stock by 10" }).expect(200)).body.data;
    expect(res.proposal).toMatchObject({ productId: p.id, delta: 10, expectedQuantity: 35, resultingQuantity: 45 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantityOnHand).toBe(35);
  });

  it("asks which product is meant when the name is ambiguous", async () => {
    await create(a, { name: "Wireless Optical Mouse", sku: "COMP-001" });
    await create(a, { name: "Wired Optical Mouse", sku: "COMP-003" });
    const res = (await a.post("/api/copilot").send({ message: "add 2 optical mouse" }).expect(200)).body.data;
    expect(res.proposal).toBeUndefined();
    expect(res.candidates.map((c: { sku: string }) => c.sku).sort()).toEqual(["COMP-001", "COMP-003"]);
    const picked = (await a.post("/api/copilot").send({ message: "add 2 optical mouse", productId: res.candidates[0].id }).expect(200)).body.data;
    expect(picked.proposal.delta).toBe(2);
  });

  it("refuses to propose taking stock below zero", async () => {
    await create(a, { name: "Stapler", sku: "STAP", quantityOnHand: 1 });
    const res = (await a.post("/api/copilot").send({ message: "remove 3 stapler" }).expect(200)).body.data;
    expect(res.proposal).toBeUndefined();
    expect(res.text).toMatch(/only 1 unit/);
  });

  it("never resolves another organization's product", async () => {
    await create(b, { name: "Secret Gadget", sku: "SECRET" });
    const res = (await a.post("/api/copilot").send({ message: "add 5 secret gadget" }).expect(200)).body.data;
    expect(res.proposal).toBeUndefined();
    const other = await prisma.product.findFirstOrThrow({ where: { sku: "SECRET" } });
    await a.post("/api/copilot").send({ message: "add 5 secret gadget", productId: other.id }).expect(404);
  });
});

describe("photo text recognition and simulation", () => {
  it("suggests products matching words read from a photo", async () => {
    await create(a, { name: "Over-Ear Bluetooth Headphones", sku: "ELEC-004" });
    const res = (await a.post("/api/recognize").send({ text: "SONIX over ear bluetooth headphones wireless" }).expect(200)).body.data;
    expect(res.matches[0]).toMatchObject({ sku: "ELEC-004", confidence: expect.stringMatching(/high|medium/) });
  });

  it("simulates without changing stock", async () => {
    const p = await create(a, { quantityOnHand: 10, costPrice: "2.00" });
    const res = (await a.post("/api/simulate").send({ productId: p.id, extraUnits: 100 }).expect(200)).body.data;
    expect(res.projected).toMatchObject({ quantity: 110, purchaseCost: "200.00" });
    expect(res.cover).toBeNull();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantityOnHand).toBe(10);
    await b.post("/api/simulate").send({ productId: p.id }).expect(404);
  });

  it("reports stock value and keeps young products out of the slow-moving list", async () => {
    await create(a, { quantityOnHand: 4, costPrice: "2.50", sellingPrice: "5.00" });
    const res = (await a.get("/api/reports").expect(200)).body.data;
    expect(res.valuation).toMatchObject({ atCost: "10.00", atSellingPrice: "20.00" });
    expect(res.slowMoving).toMatchObject({ products: [], tooNewToJudge: 1 });
  });
});

describe("unknown barcodes", () => {
  it("are recorded as exceptions and resolved once the barcode is registered", async () => {
    await a.get("/api/catalogue/lookup").query({ code: "SHELF-77", format: "Code128" }).expect(200);
    let open = (await a.get("/api/exceptions").expect(200)).body.data.exceptions.filter((e: { type: string }) => e.type === "barcode_unidentified");
    expect(open).toHaveLength(1);
    await create(a, { sku: "SHELF", barcodes: ["SHELF-77"] });
    open = (await a.get("/api/exceptions").expect(200)).body.data.exceptions.filter((e: { type: string }) => e.type === "barcode_unidentified");
    expect(open).toHaveLength(0);
  });
});
