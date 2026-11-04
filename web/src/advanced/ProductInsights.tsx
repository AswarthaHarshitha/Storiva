import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import type { EvidenceRecord, EvidenceStatus } from "../api/advanced";
import { errorMessage } from "../api/client";
import { QueryError } from "../components/QueryError";
import { useEvidence, useProductTrust, useVerifyField } from "../hooks/useAdvanced";
import { formatRelativeTime } from "../lib/format";
import { TrustBadge } from "./TrustBadge";

const statusText: Record<EvidenceStatus, { label: string; className: string }> = {
  verified: { label: "Checked", className: "text-ok" },
  documented: { label: "From a document", className: "text-ink" },
  entered: { label: "Entered", className: "text-ink-muted" },
  unverified: { label: "Unverified", className: "text-warn" },
};

const sourceText = (r: EvidenceRecord) =>
  ({ catalogue: `Product catalogue${r.detail ? ` (${r.detail})` : ""}`, manual: "Typed in Storiva", import: `CSV import${r.detail ? ` (${r.detail})` : ""}`, receipt: r.detail ?? "Supplier receipt", manual_check: "Checked by a person" })[r.source] ?? r.source;

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-line py-6 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <div className="max-w-xl">{children}</div>
    </section>
  );
}

export function TrustPanel({ productId }: { productId: string }) {
  const trust = useProductTrust(productId);
  return (
    <Section title="Stock reliability" description="How far the recorded quantity can be relied on, from its stock history. A guide, not a probability.">
      {trust.isPending ? (
        <p className="text-sm text-ink-muted">Assessing…</p>
      ) : trust.isError ? (
        <QueryError error={trust.error} onRetry={() => void trust.refetch()} />
      ) : (
        <div className="space-y-2 rounded-md border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <TrustBadge level={trust.data.level} />
            <span className="text-sm text-ink-muted">
              {trust.data.lastCount ? `Last counted ${trust.data.lastCount.countedQuantity} on ${new Date(trust.data.lastCount.date).toLocaleDateString()}` : "Never counted"}
            </span>
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
            {trust.data.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-sm font-medium">{trust.data.recommendation}</p>
          {trust.data.level !== "high" && (
            <Link to="/scan?mode=count" className="inline-block text-sm font-medium text-accent hover:underline">
              Count it now
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}

export function EvidencePanel({ productId }: { productId: string }) {
  const evidence = useEvidence(productId);
  const verify = useVerifyField(productId);
  return (
    <Section title="Where this information comes from" description="The origin of each detail. Values set before tracking began show as unknown rather than guessed.">
      {evidence.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : evidence.isError ? (
        <QueryError error={evidence.error} onRetry={() => void evidence.refetch()} />
      ) : (
        <div className="space-y-3">
          <dl className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
            <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2.5">
              <dt className="font-medium">Quantity</dt>
              <dd className="text-ink-muted">
                {evidence.data.quantity.lastCount ? (
                  <>
                    <span className="text-ok">Verified by count</span> of {evidence.data.quantity.lastCount.quantity} {formatRelativeTime(evidence.data.quantity.lastCount.date)}
                    {evidence.data.quantity.changesSinceCount > 0 && `; ${evidence.data.quantity.changesSinceCount} recorded changes since`}
                  </>
                ) : (
                  <>Not verified by a physical count{evidence.data.quantity.historyStartsAt ? "" : "; no stock history recorded"}</>
                )}
              </dd>
            </div>
            {evidence.data.fields
              .filter((f) => f.value !== null)
              .map((f) => (
                <div key={f.field} className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2.5">
                  <dt className="font-medium">{f.label}</dt>
                  <dd className="min-w-0">
                    {f.origin ? (
                      <span className="text-ink-muted">
                        <span className={statusText[f.origin.status].className}>{statusText[f.origin.status].label}</span> · {sourceText(f.origin)} ·{" "}
                        {formatRelativeTime(f.origin.recordedAt)}
                        {f.origin.by && ` by ${f.origin.by}`}
                      </span>
                    ) : (
                      <span className="text-ink-faint">Origin unknown</span>
                    )}
                    {f.origin?.status !== "verified" && (
                      <button
                        type="button"
                        onClick={() => verify.mutate(f.field)}
                        disabled={verify.isPending}
                        className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Mark as checked<span className="sr-only"> ({f.label})</span>
                      </button>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
          {verify.isError && <p className="text-sm text-danger">{errorMessage(verify.error)}</p>}
        </div>
      )}
    </Section>
  );
}
