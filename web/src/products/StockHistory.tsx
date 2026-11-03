import type { StockMovement } from "../api/types";
import { QueryError } from "../components/QueryError";
import { useMovements } from "../hooks/useInventory";
import { formatCount, formatRelativeTime } from "../lib/format";

const typeLabel: Record<StockMovement["type"], string> = {
  create: "Created",
  edit: "Edited",
  adjust: "Adjusted",
  receive: "Received",
  issue: "Issued",
  count: "Counted",
};

const sourceLabel: Record<StockMovement["source"], string> = {
  manual: "",
  camera: " · camera scan",
  scanner: " · barcode scanner",
};

export function StockHistory({ productId }: { productId: string }) {
  const movements = useMovements(productId);

  return (
    <section aria-labelledby="history-heading" className="grid gap-x-10 gap-y-4 border-t border-line py-6 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 id="history-heading" className="text-sm font-semibold">
          Stock history
        </h2>
        <p className="mt-1 text-sm text-ink-muted">The most recent changes to this product's quantity.</p>
      </div>
      <div className="max-w-xl">
        {movements.isPending ? (
          <p className="text-sm text-ink-muted">Loading history…</p>
        ) : movements.isError ? (
          <QueryError error={movements.error} onRetry={() => void movements.refetch()} />
        ) : movements.data.length === 0 ? (
          <p className="text-sm text-ink-muted">No stock changes have been recorded for this product yet.</p>
        ) : (
          <ol className="divide-y divide-line rounded-md border border-line bg-surface">
            {movements.data.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {typeLabel[m.type]}
                    <span className="font-normal text-ink-muted">{sourceLabel[m.source]}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatRelativeTime(m.createdAt)}
                    {m.user && <> · {m.user}</>}
                    {m.note && <> · “{m.note}”</>}
                  </p>
                </div>
                <p className="shrink-0 text-right tabular-nums">
                  <span className={m.quantityChange > 0 ? "text-ok" : m.quantityChange < 0 ? "text-danger" : "text-ink-muted"}>
                    {m.quantityChange > 0 ? "+" : m.quantityChange < 0 ? "−" : "±"}
                    {formatCount(Math.abs(m.quantityChange))}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {formatCount(m.quantityBefore)} → {formatCount(m.quantityAfter)}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
