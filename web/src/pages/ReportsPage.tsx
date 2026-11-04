import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api/client";
import { ProductPicker } from "../advanced/ProductPicker";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useReports, useSimulation } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatCount } from "../lib/format";

export function ReportsPage() {
  useDocumentTitle("Reports & simulator");
  const [days, setDays] = useState(60);
  const reports = useReports(days);

  return (
    <>
      <PageHeader title="Reports & simulator" description="Figures from your recorded stock and prices, and what-if scenarios that never change real stock." />
      {reports.isPending ? (
        <LoadingState label="Calculating…" />
      ) : reports.isError ? (
        <QueryError error={reports.error} onRetry={() => void reports.refetch()} />
      ) : (
        <div className="space-y-8">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <dt className="text-sm font-medium text-ink-muted">Stock value at cost</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{reports.data.valuation.atCost}</dd>
              {reports.data.valuation.missingCost > 0 && <dd className="text-xs text-ink-faint">{reports.data.valuation.missingCost} products without a cost price not included</dd>}
            </div>
            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <dt className="text-sm font-medium text-ink-muted">At selling price</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{reports.data.valuation.atSellingPrice}</dd>
              {reports.data.valuation.missingPrice > 0 && <dd className="text-xs text-ink-faint">{reports.data.valuation.missingPrice} without a selling price not included</dd>}
            </div>
            <div className="rounded-lg border border-line bg-surface px-5 py-4">
              <dt className="text-sm font-medium text-ink-muted">Capital in slow-moving stock</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{reports.data.slowMoving.capitalAtCost}</dd>
              <dd className="text-xs text-ink-faint">Nothing issued in {days} days</dd>
            </div>
          </dl>

          <section aria-labelledby="slow-heading">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="slow-heading" className="text-base font-semibold">Slow-moving stock</h2>
                <p className="text-sm text-ink-muted">
                  Products in stock with no recorded issue in the period, by value at cost.
                  {reports.data.slowMoving.tooNewToJudge > 0 && ` ${reports.data.slowMoving.tooNewToJudge} products have less history than the period and are not judged yet.`}
                </p>
              </div>
              <label className="text-sm">
                Period{" "}
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-field bg-surface px-2 py-1.5">
                  {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </label>
            </div>
            {reports.data.slowMoving.products.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-muted">No slow-moving products in this period.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
                {reports.data.slowMoving.products.slice(0, 20).map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-4 py-2.5">
                    <Link to={`/products/${p.id}/edit`} className="font-medium hover:text-accent hover:underline">{p.name}</Link>
                    <span className="text-ink-muted tabular-nums">{formatCount(p.quantity)} units · {p.valueAtCost ?? "no cost price"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="corrections-heading">
            <h2 id="corrections-heading" className="text-base font-semibold">Most-corrected products (30 days)</h2>
            <p className="mb-2 text-sm text-ink-muted">Manual edits and adjustments to quantity. Frequent corrections often point to counting or recording problems.</p>
            {reports.data.corrections.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-muted">No manual corrections in the last 30 days.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
                {reports.data.corrections.map((c) => (
                  <li key={`${c.productId ?? ""}${c.sku}`} className="flex justify-between gap-3 px-4 py-2.5">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-ink-muted tabular-nums">{c.corrections} corrections · net {c.netChange > 0 ? "+" : ""}{c.netChange}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Simulator />
        </div>
      )}
    </>
  );
}

function Simulator() {
  const [product, setProduct] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [extra, setExtra] = useState("0");
  const [demand, setDemand] = useState("0");
  const [delay, setDelay] = useState("0");
  const [price, setPrice] = useState("");
  const sim = useSimulation();
  const int = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v) : NaN);

  const run = (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    sim.mutate({ productId: product.id, extraUnits: int(extra) || 0, demandChangePercent: int(demand) || 0, delayDays: int(delay) || 0, newPrice: price.trim() || null });
  };
  const r = sim.data;

  return (
    <section aria-labelledby="sim-heading" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="sim-heading" className="text-base font-semibold">What if…</h2>
      <p className="mb-4 text-sm text-ink-muted">A hypothetical calculation for one product. It never changes your stock or prices.</p>
      <form onSubmit={run} noValidate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-5">
          <span className="mb-1.5 block text-sm font-medium">Product</span>
          <ProductPicker label="simulator product" value={product} onChange={setProduct} />
        </div>
        <TextField label="Purchase extra units" name="extra" inputMode="numeric" value={extra} onValueChange={setExtra} />
        <TextField label="Demand change (%)" name="demand" inputMode="numeric" value={demand} onValueChange={setDemand} hint="e.g. 20 or -10" />
        <TextField label="Delivery delay (days)" name="delay" inputMode="numeric" value={delay} onValueChange={setDelay} />
        <TextField label="New selling price" name="price" inputMode="decimal" value={price} onValueChange={setPrice} hint="Optional" />
        <div className="flex items-end">
          <Button type="submit" disabled={!product} loading={sim.isPending} loadingLabel="Calculating…">Simulate</Button>
        </div>
      </form>
      {sim.isError && <div className="mt-4"><Alert>{errorMessage(sim.error)}</Alert></div>}
      {r && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr><th className="py-2 font-medium"><span className="sr-only">Measure</span></th><th className="py-2 text-right font-medium">Actual now</th><th className="py-2 text-right font-medium">Hypothetical</th></tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              <tr><th scope="row" className="py-2 text-left font-normal">Units</th><td className="text-right">{formatCount(r.actual.quantity)}</td><td className="text-right font-medium">{formatCount(r.projected.quantity)}</td></tr>
              <tr><th scope="row" className="py-2 text-left font-normal">Purchase cost</th><td className="text-right text-ink-faint">—</td><td className="text-right">{r.projected.purchaseCost ?? "unknown"}</td></tr>
              <tr><th scope="row" className="py-2 text-left font-normal">Value at cost</th><td className="text-right">{r.actual.valueAtCost ?? "unknown"}</td><td className="text-right">{r.projected.valueAtCost ?? "unknown"}</td></tr>
              <tr><th scope="row" className="py-2 text-left font-normal">Value at selling price</th><td className="text-right">{r.actual.valueAtPrice ?? "unknown"}</td><td className="text-right">{r.projected.valueAtPrice ?? "unknown"}</td></tr>
              <tr><th scope="row" className="py-2 text-left font-normal">Margin per unit</th><td className="text-right">{r.actual.marginPerUnit ?? "unknown"}</td><td className="text-right">{r.projected.marginPerUnit ?? "unknown"}</td></tr>
              {r.cover && (
                <>
                  <tr><th scope="row" className="py-2 text-left font-normal">Days of stock</th><td className="text-right">{r.cover.current}</td><td className="text-right">{r.cover.projected} (until about {r.cover.stockoutDate})</td></tr>
                  {r.cover.atDelivery !== null && (
                    <tr><th scope="row" className="py-2 text-left font-normal">Units left when the delayed delivery arrives</th><td className="text-right text-ink-faint">—</td><td className={`text-right ${r.shortfallRisk ? "font-medium text-danger" : ""}`}>{r.cover.atDelivery}{r.shortfallRisk ? " (would run out first)" : ""}</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div><h3 className="font-medium">Assumptions</h3><ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
            <div><h3 className="font-medium">Uncertainty</h3><ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">{r.uncertainty.map((u) => <li key={u}>{u}</li>)}</ul></div>
          </div>
        </div>
      )}
    </section>
  );
}
