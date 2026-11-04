import { describe, expect, it } from "vitest";
import { expandQuantities, LABEL_LAYOUTS, paginate, type LabelItem, type LabelLayout } from "./layouts";

const item = (sku: string): LabelItem => ({ productId: sku, name: sku, sku, price: null });
const byId = (id: string) => LABEL_LAYOUTS.find((l) => l.id === id) as LabelLayout;

describe("label layouts", () => {
  it("fit on A4 paper", () => {
    for (const l of LABEL_LAYOUTS.filter((x) => x.kind === "sheet")) {
      expect(l.left * 2 + l.columns * l.width + (l.columns - 1) * l.gapX).toBeLessThanOrEqual(210.01);
      expect(l.top + l.rows * l.height + (l.rows - 1) * l.gapY).toBeLessThanOrEqual(297.01);
    }
  });
});

describe("paginate", () => {
  it("puts one label per page on a roll", () => {
    expect(paginate([item("A"), item("B")], byId("roll-50x25"))).toEqual([[item("A")], [item("B")]]);
  });

  it("fills sheets row by row and pads the last one", () => {
    const pages = paginate(Array.from({ length: 23 }, (_, i) => item(`P${i}`)), byId("a4-21"));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(21);
    expect(pages[1]?.filter(Boolean)).toHaveLength(2);
  });

  it("can skip used positions on the first sheet", () => {
    const [page] = paginate([item("A")], byId("a4-21"), 4);
    expect(page?.slice(0, 5)).toEqual([null, null, null, null, item("A")]);
  });
});

describe("expandQuantities", () => {
  it("repeats each product by its count and ignores zero", () => {
    expect(expandQuantities([{ item: item("A"), copies: 2 }, { item: item("B"), copies: 0 }]).map((i) => i.sku)).toEqual(["A", "A"]);
  });
});
