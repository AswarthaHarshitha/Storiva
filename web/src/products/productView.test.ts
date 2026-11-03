import { describe, expect, it } from "vitest";
import type { Product } from "../api/types";
import { applyView, readView } from "./productView";

const product = (name: string, quantityOnHand: number, effectiveThreshold = 5): Product => ({
  id: name,
  name,
  sku: name.toUpperCase(),
  description: null,
  quantityOnHand,
  costPrice: null,
  sellingPrice: null,
  lowStockThreshold: null,
  effectiveThreshold,
  isLowStock: quantityOnHand <= effectiveThreshold,
  lastAdjustmentNote: null,
  lastUpdatedBy: null,
  barcodes: [],
  createdAt: "",
  updatedAt: "",
});

// Already in name order, as the API returns them.
const products = [product("apron", 12), product("basket", 0), product("candle", 5), product("doormat", 3, 2), product("easel", 0, 0)];
const names = (list: Product[]) => list.map((p) => p.name);

describe("applyView", () => {
  it("keeps the server's name order by default", () => {
    expect(names(applyView(products, "all", "name"))).toEqual(["apron", "basket", "candle", "doormat", "easel"]);
  });

  it("filters low stock using the same flag as the dashboard, including out of stock", () => {
    expect(names(applyView(products, "low", "name"))).toEqual(["basket", "candle", "easel"]);
  });

  it("filters out-of-stock products", () => {
    expect(names(applyView(products, "out", "name"))).toEqual(["basket", "easel"]);
  });

  it("sorts by quantity in both directions, keeping name order for ties", () => {
    expect(names(applyView(products, "all", "quantity-asc"))).toEqual(["basket", "easel", "doormat", "candle", "apron"]);
    expect(names(applyView(products, "all", "quantity-desc"))).toEqual(["apron", "candle", "doormat", "basket", "easel"]);
  });

  it("does not modify the list it is given", () => {
    const copy = [...products];
    applyView(products, "all", "quantity-desc");
    expect(products).toEqual(copy);
  });
});

describe("readView", () => {
  it("reads valid parameters", () => {
    expect(readView(new URLSearchParams("status=low&sort=quantity-asc"))).toEqual({ status: "low", sort: "quantity-asc" });
  });

  it("falls back to defaults for missing or unknown values", () => {
    expect(readView(new URLSearchParams(""))).toEqual({ status: "all", sort: "name" });
    expect(readView(new URLSearchParams("status=gone&sort=price"))).toEqual({ status: "all", sort: "name" });
  });
});
