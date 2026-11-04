import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { InventoryException } from "../api/advanced";
import { errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useExceptions, useResolveException } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatRelativeTime } from "../lib/format";

const TYPE_LABELS: Record<string, string> = {
  count_discrepancy: "Count difference",
  unusual_adjustment: "Large correction",
  never_counted: "Never counted",
  incomplete_pricing: "Missing prices",
  barcode_unidentified: "Unknown barcode",
  import_errors: "Import errors",
  receipt_discrepancy: "Receiving discrepancy",
  sync_failure: "Offline sync",
};

/** Turns an exception's recorded evidence into readable lines. */
function evidenceLines(e: InventoryException): string[] {
  const d = e.detail as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof d.before === "number" && typeof d.after === "number") {
    lines.push(`${String(d.before)} → ${String(d.after)} on ${new Date(String(d.date)).toLocaleString()}${d.by ? ` by ${String(d.by)}` : ""}${d.note ? ` (note: “${String(d.note)}”)` : ""}`);
  }
  if (typeof d.rule === "string") lines.push(`Rule: ${d.rule}`);
  if (Array.isArray(d.examples)) lines.push(`For example: ${(d.examples as { name: string }[]).map((x) => x.name).join(", ")}${typeof d.count === "number" && d.count > d.examples.length ? `, and ${d.count - d.examples.length} more` : ""}`);
  if (Array.isArray(d.issues)) lines.push(...(d.issues as string[]));
  if (Array.isArray(d.errors)) lines.push(...(d.errors as { row: number; sku?: string; message: string }[]).slice(0, 8).map((x) => `Row ${x.row}${x.sku ? ` (${x.sku})` : ""}: ${x.message}`));
  if (typeof d.code === "string") lines.push(`Code ${d.code}${d.catalogueChecked ? "; no catalogue had details for it" : ""}`);
  if (typeof d.error === "string") lines.push(`Refused with: ${d.error}`);
  return lines;
}

export function ExceptionsPage() {
  useDocumentTitle("Exceptions");
  const [tab, setTab] = useState<"open" | "closed">("open");
  const list = useExceptions(tab);
  const [resolving, setResolving] = useState<InventoryException | null>(null);

  return (
    <>
      <PageHeader title="Exceptions" description="Problems found in your recorded data, with the evidence and a suggested next step. Re-checked each time you open this page." />
      <div role="tablist" aria-label="Status" className="mb-4 inline-grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {t === "open" ? "Open" : "Closed"}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <LoadingState label="Checking your inventory…" />
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.exceptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-muted">
          {tab === "open" ? "Nothing needs attention right now." : "No exceptions have been closed yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.data.exceptions.map((e) => (
            <li key={e.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">{TYPE_LABELS[e.type] ?? e.type}</p>
                  <h2 className="font-semibold">{e.title}</h2>
                  {e.product && (
                    <Link to={`/products/${e.product.id}/edit`} className="text-sm text-accent hover:underline">
                      {e.product.name} · {e.product.sku}
                    </Link>
                  )}
                </div>
                <span className="text-xs text-ink-faint">{formatRelativeTime(e.createdAt)}</span>
              </div>
              {evidenceLines(e).length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
                  {evidenceLines(e).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              {e.detail.recommendation && <p className="mt-2 text-sm"><span className="font-medium">Suggested: </span>{e.detail.recommendation}</p>}
              {e.status === "open" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(e.type === "count_discrepancy" || e.type === "unusual_adjustment") && (
                    <Link to="/scan?mode=count" className="inline-flex h-9 items-center rounded-md border border-line-strong px-3.5 text-sm font-medium hover:bg-sunken">
                      Recount
                    </Link>
                  )}
                  {e.type === "never_counted" && (
                    <Link to="/trust" className="inline-flex h-9 items-center rounded-md border border-line-strong px-3.5 text-sm font-medium hover:bg-sunken">
                      Open Trust Radar
                    </Link>
                  )}
                  <Button variant="secondary" onClick={() => setResolving(e)}>
                    Resolve…
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  {e.status === "resolved" ? "Resolved" : "Dismissed"}
                  {e.resolvedAt && ` ${formatRelativeTime(e.resolvedAt)}`}: {e.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <ResolveDialog exception={resolving} onClose={() => setResolving(null)} />
    </>
  );
}

function ResolveDialog({ exception, onClose }: { exception: InventoryException | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"resolved" | "dismissed">("resolved");
  const resolve = useResolveException();
  const toast = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!exception || !note.trim() || resolve.isPending) return;
    resolve.mutate(
      { id: exception.id, status, note: note.trim() },
      {
        onSuccess: () => {
          toast(status === "resolved" ? "Marked as resolved." : "Dismissed.");
          setNote("");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={exception !== null} onClose={onClose} title="Close this exception">
      {exception && (
        <form onSubmit={submit} className="mt-2 space-y-4" noValidate>
          <p className="text-sm text-ink-muted">{exception.title}. This does not change any stock.</p>
          <fieldset className="space-y-1.5 text-sm">
            <legend className="mb-1 font-medium">Outcome</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="status" checked={status === "resolved"} onChange={() => setStatus("resolved")} className="accent-[var(--color-accent)]" />
              Resolved: the cause was found or fixed
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="status" checked={status === "dismissed"} onChange={() => setStatus("dismissed")} className="accent-[var(--color-accent)]" />
              Dismissed: not a problem
            </label>
          </fieldset>
          <TextField label="Note" name="note" required value={note} onValueChange={setNote} hint="Required. Say what you found, for the record." maxLength={500} autoFocus />
          {resolve.isError && <Alert>{errorMessage(resolve.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!note.trim()} loading={resolve.isPending} loadingLabel="Saving…">
              Confirm
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
