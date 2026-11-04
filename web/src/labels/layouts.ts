/** Label stock Storiva can print on. Dimensions in millimetres. */
export interface LabelLayout {
  id: string;
  name: string;
  kind: "roll" | "sheet";
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Sheet margins and gaps between labels. */
  top: number;
  left: number;
  gapX: number;
  gapY: number;
}

const roll = (w: number, h: number): LabelLayout => ({
  id: `roll-${w}x${h}`,
  name: `Thermal roll ${w} × ${h} mm`,
  kind: "roll",
  width: w,
  height: h,
  columns: 1,
  rows: 1,
  top: 0,
  left: 0,
  gapX: 0,
  gapY: 0,
});

export const LABEL_LAYOUTS: LabelLayout[] = [
  roll(50, 25),
  roll(40, 30),
  roll(58, 40),
  roll(100, 50),
  { id: "a4-21", name: "A4 sheet, 21 labels of 63.5 × 38.1 mm (L7160 type)", kind: "sheet", width: 63.5, height: 38.1, columns: 3, rows: 7, top: 15.15, left: 7.21, gapX: 2.54, gapY: 0 },
  { id: "a4-24", name: "A4 sheet, 24 labels of 70 × 37 mm", kind: "sheet", width: 70, height: 37, columns: 3, rows: 8, top: 0.5, left: 0, gapX: 0, gapY: 0 },
  { id: "a4-65", name: "A4 sheet, 65 labels of 38.1 × 21.2 mm (L7651 type)", kind: "sheet", width: 38.1, height: 21.2, columns: 5, rows: 13, top: 10.7, left: 4.65, gapX: 2.54, gapY: 0 },
];

export interface LabelItem {
  productId: string;
  name: string;
  sku: string;
  price: string | null;
}

/**
 * Lays labels out page by page: one label per page on a roll, rows × columns on a sheet.
 * `skip` leaves the first positions of the first sheet empty, so a part-used sheet can be reused.
 */
export function paginate(items: LabelItem[], layout: LabelLayout, skip = 0): (LabelItem | null)[][] {
  if (layout.kind === "roll") return items.map((item) => [item]);
  const perPage = layout.columns * layout.rows;
  const cells: (LabelItem | null)[] = [...Array<null>(Math.min(Math.max(skip, 0), perPage - 1)).fill(null), ...items];
  const pages: (LabelItem | null)[][] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    const page = cells.slice(i, i + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
}

/** Repeats each product by its requested label count. */
export function expandQuantities(selection: { item: LabelItem; copies: number }[]): LabelItem[] {
  return selection.flatMap(({ item, copies }) => Array<LabelItem>(Math.max(0, Math.min(copies, 500))).fill(item));
}
