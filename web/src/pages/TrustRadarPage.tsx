import { useState } from "react";
import { Link } from "react-router-dom";
import type { TrustLevel } from "../api/advanced";
import { TrustBadge, trustLabel } from "../advanced/TrustBadge";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { useTrust } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatCount } from "../lib/format";

const LEVELS: TrustLevel[] = ["unverified", "low", "medium", "high"];

export function TrustRadarPage() {
  useDocumentTitle("Trust Radar");
  const trust = useTrust();
  const [filter, setFilter] = useState<TrustLevel | "all">("all");

  return (
    <>
      <PageHeader
        title="Trust Radar"
        description="How far each recorded quantity can be relied on, based on physical counts and the changes since. Levels come from fixed rules, not probabilities."
      />
      {trust.isPending ? (
        <LoadingState label="Assessing your inventory…" />
      ) : trust.isError ? (
        <QueryError error={trust.error} onRetry={() => void trust.refetch()} />
      ) : (
        <div className="space-y-8">
          <div role="group" aria-label="Filter by level" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={filter === level}
                onClick={() => setFilter(filter === level ? "all" : level)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${filter === level ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-sunken/60"}`}
              >
                <span className="block text-2xl font-semibold tabular-nums">{formatCount(trust.data.summary[level])}</span>
                <TrustBadge level={level} />
              </button>
            ))}
          </div>

          {trust.data.queue.length > 0 && (
            <section aria-labelledby="queue-heading">
              <h2 id="queue-heading" className="mb-1 text-base font-semibold">
                Count these next
              </h2>
              <p className="mb-3 text-sm text-ink-muted">The most doubtful quantities first, then the products holding the most units.</p>
              <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
                {trust.data.queue.map((p, i) => (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 w-5 text-sm text-ink-faint tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/products/${p.id}/edit`} className="font-medium hover:text-accent hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-sm text-ink-muted">{p.reasons[0]}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <TrustBadge level={p.level} />
                      <p className="mt-1 text-xs text-ink-muted tabular-nums">{formatCount(p.currentQuantity)} on record</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/scan?mode=count" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Start counting in the scanner
              </Link>
            </section>
          )}

          <section aria-labelledby="all-heading">
            <h2 id="all-heading" className="mb-3 text-base font-semibold">
              {filter === "all" ? "All products" : trustLabel(filter)}
            </h2>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-sunken/60 text-left text-xs text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Level</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Recorded</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Last verified</th>
                    <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trust.data.products
                    .filter((p) => filter === "all" || p.level === filter)
                    .map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5">
                          <Link to={`/products/${p.id}/edit`} className="font-medium hover:text-accent hover:underline">
                            {p.name}
                          </Link>
                          <span className="block font-mono text-xs text-ink-muted">{p.sku}</span>
                        </td>
                        <td className="px-4 py-2.5"><TrustBadge level={p.level} /></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(p.currentQuantity)}</td>
                        <td className="hidden px-4 py-2.5 text-right text-ink-muted tabular-nums sm:table-cell">
                          {p.lastCount ? `${formatCount(p.lastCount.countedQuantity)} · ${new Date(p.lastCount.date).toLocaleDateString()}` : "—"}
                        </td>
                        <td className="hidden max-w-sm px-4 py-2.5 text-ink-muted md:table-cell">{p.reasons.join(" ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
