import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Printer, X } from "lucide-react";
import { ProductPicker } from "../advanced/ProductPicker";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useProducts } from "../hooks/useInventory";
import type { LabelSymbology } from "../labels/barcodeImage";
import { LabelView } from "../labels/LabelView";
import { expandQuantities, LABEL_LAYOUTS, paginate, type LabelItem } from "../labels/layouts";

export function LabelsPage() {
  useDocumentTitle("Labels");
  const [params] = useSearchParams();
  const all = useProducts("");
  const preselected = params.get("ids")?.split(",").filter(Boolean) ?? [];
  const [chosen, setChosen] = useState<Record<string, number> | null>(null);
  const [symbology, setSymbology] = useState<LabelSymbology>("code128");
  const [layoutId, setLayoutId] = useState("roll-50x25");
  const [showPrice, setShowPrice] = useState(false);
  const [skip, setSkip] = useState("0");

  // Products arriving from a link start with one label each.
  const copies = chosen ?? Object.fromEntries(preselected.map((id) => [id, 1]));
  const layout = LABEL_LAYOUTS.find((l) => l.id === layoutId) ?? (LABEL_LAYOUTS[0] as (typeof LABEL_LAYOUTS)[number]);
  const products = all.data ?? [];
  const selection = products
    .filter((p) => p.id in copies)
    .map((p) => ({ item: { productId: p.id, name: p.name, sku: p.sku, price: p.sellingPrice } as LabelItem, copies: copies[p.id] ?? 0 }));
  const pages = paginate(expandQuantities(selection), layout, Number(skip) || 0);
  const total = selection.reduce((s, x) => s + x.copies, 0);
  const setCopies = (id: string, n: number) => setChosen({ ...copies, [id]: n });

  return (
    <>
      <PageHeader
        title="Labels"
        description="Print barcode labels that the Storiva scanner reads. Labels encode the product's SKU; no retail (EAN/UPC) numbers are created."
        actions={
          <Button onClick={() => window.print()} disabled={total === 0}>
            <Printer className="size-4" aria-hidden />
            Print {total} {total === 1 ? "label" : "labels"}
          </Button>
        }
      />
      <style>{`@page { size: ${layout.kind === "roll" ? `${layout.width}mm ${layout.height}mm` : "A4"}; margin: 0; }`}</style>

      <div className="grid gap-6 print:hidden lg:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Products</h2>
            <ProductPicker label="label product" value={null} onChange={(p) => p && setCopies(p.id, (copies[p.id] ?? 0) + 1)} />
            <button type="button" onClick={() => setChosen(Object.fromEntries(products.map((p) => [p.id, copies[p.id] ?? 1])))} className="text-sm font-medium text-accent hover:underline">
              Add all {products.length} products
            </button>
            {selection.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line">
                {selection.map(({ item, copies: n }) => (
                  <li key={item.productId} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <label className="flex items-center gap-1 text-xs text-ink-muted">
                      Copies
                      <input type="number" min={0} max={500} value={n} onChange={(e) => setCopies(item.productId, Math.max(0, Math.min(500, Number(e.target.value) || 0)))} className="w-16 rounded border border-field px-1.5 py-1 text-sm" />
                    </label>
                    <button type="button" onClick={() => setChosen(Object.fromEntries(Object.entries(copies).filter(([id]) => id !== item.productId)))} aria-label={`Remove ${item.name}`} className="rounded p-1 text-ink-muted hover:text-ink">
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm">
            <h2 className="font-semibold">Layout</h2>
            <label className="block">
              <span className="mb-1 block font-medium">Label stock</span>
              <select value={layoutId} onChange={(e) => setLayoutId(e.target.value)} className="w-full rounded-md border border-field bg-surface px-2.5 py-2">
                {LABEL_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="mb-1 font-medium">Code</legend>
              {(["code128", "qr"] as const).map((s) => (
                <label key={s} className="mr-4 inline-flex items-center gap-1.5">
                  <input type="radio" name="symbology" checked={symbology === s} onChange={() => setSymbology(s)} className="accent-[var(--color-accent)]" />
                  {s === "qr" ? "QR code" : "Code 128"}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="accent-[var(--color-accent)]" />
              Show selling price
            </label>
            {layout.kind === "sheet" && (
              <label className="block">
                <span className="mb-1 block font-medium">Skip used positions</span>
                <input type="number" min={0} max={layout.columns * layout.rows - 1} value={skip} onChange={(e) => setSkip(e.target.value)} className="w-24 rounded-md border border-field px-2 py-1.5" />
              </label>
            )}
            <p className="text-ink-muted">In the print dialog, set scale to 100% (or “Actual size”). Choose “Save as PDF” to keep a file.</p>
          </section>
        </div>

        <section aria-label="Print preview" className="min-w-0">
          <h2 className="mb-2 text-sm font-semibold">Preview</h2>
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-muted">Add products to see their labels.</p>
          ) : (
            <div className="max-h-[70vh] space-y-4 overflow-auto rounded-lg bg-sunken p-4">
              <LabelPages pages={pages} layout={layout} symbology={symbology} showPrice={showPrice} />
            </div>
          )}
        </section>
      </div>

      {/* The only thing printed. */}
      <div className="print-area hidden print:block">
        <LabelPages pages={pages} layout={layout} symbology={symbology} showPrice={showPrice} />
      </div>
    </>
  );
}

function LabelPages({ pages, ...props }: { pages: (LabelItem | null)[][] } & Omit<Parameters<typeof LabelView>[0], "item">) {
  const { layout } = props;
  return (
    <>
      {pages.map((page, i) => (
        <div
          key={i}
          className="print-page bg-white shadow-sm print:shadow-none"
          style={
            layout.kind === "roll"
              ? { width: `${layout.width}mm`, height: `${layout.height}mm` }
              : {
                  width: "210mm",
                  height: "297mm",
                  paddingTop: `${layout.top}mm`,
                  paddingLeft: `${layout.left}mm`,
                  display: "grid",
                  gridTemplateColumns: `repeat(${layout.columns}, ${layout.width}mm)`,
                  gridAutoRows: `${layout.height}mm`,
                  columnGap: `${layout.gapX}mm`,
                  rowGap: `${layout.gapY}mm`,
                  alignContent: "start",
                }
          }
        >
          {page.map((item, j) => (item ? <LabelView key={j} item={item} {...props} /> : <div key={j} />))}
        </div>
      ))}
    </>
  );
}
