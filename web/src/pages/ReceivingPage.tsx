import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { ButtonLink } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { useReceipts } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function ReceivingPage() {
  useDocumentTitle("Receiving");
  const receipts = useReceipts();
  return (
    <>
      <PageHeader
        title="Receiving"
        description="Record deliveries against what you expected. Stock changes only when you confirm a receipt."
        actions={
          <ButtonLink to="/receiving/new">
            <Plus className="size-4" aria-hidden />
            New receipt
          </ButtonLink>
        }
      />
      {receipts.isPending ? (
        <LoadingState label="Loading receipts…" />
      ) : receipts.isError ? (
        <QueryError error={receipts.error} onRetry={() => void receipts.refetch()} />
      ) : receipts.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-muted">
          No receipts yet. Start one by hand, or read an invoice photo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-sunken/60 text-left text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Reference</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Supplier</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Lines</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {receipts.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <Link to={`/receiving/${r.id}`} className="font-medium hover:text-accent hover:underline">
                      {r.reference ?? "Without reference"}
                    </Link>
                    <span className="block text-xs text-ink-muted">{new Date(r.createdAt).toLocaleDateString()}{r.source === "invoice" ? " · from invoice" : ""}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{r.supplier?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.status === "confirmed" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                      {r.status === "confirmed" ? "Confirmed" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.lineCount}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{r.totalAmount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
