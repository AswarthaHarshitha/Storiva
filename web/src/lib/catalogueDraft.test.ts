import { describe, expect, it } from "vitest";
import type { CatalogueMatch } from "../api/types";
import { draftFromMatch } from "./catalogueDraft";

const match: CatalogueMatch = {
  provider: "openfacts",
  providerName: "Open Food Facts",
  sourceName: "Open Food Facts",
  sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
  licence: { name: "Open Database License (ODbL)", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
  retrievedAt: "2026-11-04T10:00:00.000Z",
  name: "Nutella",
  brand: "Nutella",
  description: "Hazelnut And Cocoa Spread, 400 g",
  manufacturer: "Ferrero",
  category: "Snacks",
  imageUrl: "https://images.openfoodfacts.org/x.jpg",
};

describe("draftFromMatch", () => {
  it("fills only the facts the catalogue returned", () => {
    const draft = draftFromMatch("3017620422003", match);
    expect(draft.values).toMatchObject({ name: "Nutella", brand: "Nutella", manufacturer: "Ferrero", category: "Snacks", barcode: "3017620422003" });
    expect(draft.source).toEqual({ provider: "openfacts", sourceName: "Open Food Facts", retrievedAt: "2026-11-04T10:00:00.000Z" });
    expect(draft.imageUrl).toBe("https://images.openfoodfacts.org/x.jpg");
  });

  it("never fills quantity, prices or threshold", () => {
    const { values } = draftFromMatch("3017620422003", match);
    expect([values.quantityOnHand, values.costPrice, values.sellingPrice, values.lowStockThreshold]).toEqual(["", "", "", ""]);
  });

  it("starts the SKU as the barcode", () => {
    expect(draftFromMatch("3017620422003", match).values.sku).toBe("3017620422003");
  });

  it("leaves every detail empty when nothing was found", () => {
    const draft = draftFromMatch("4006381333931", null);
    expect(draft.values).toMatchObject({ name: "", brand: "", description: "", category: "", sku: "4006381333931" });
    expect(draft.source).toBeNull();
    expect(draft.imageUrl).toBeNull();
  });

  it("keeps missing fields empty rather than guessing", () => {
    const draft = draftFromMatch("3017620422003", { ...match, brand: null, category: null, imageUrl: null });
    expect(draft.values.brand).toBe("");
    expect(draft.values.category).toBe("");
    expect(draft.imageUrl).toBeNull();
  });
});
