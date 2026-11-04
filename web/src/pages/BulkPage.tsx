import { useState, type ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import type { ImportRowPlan, ImportSummary } from "../api/advanced";
import { errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { useImportCommit, useImportPreview } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { autoMap, IMPORT_FIELDS, parseCsv, toImportRows, type ImportField } from "../bulk/csv";

const MAX_BYTES = 5 * 1024 * 1024;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function BulkPage() {
  useDocumentTitle("Import & export");
  const [file, setFile] = useState<{ name: string; headers: string[]; data: string[][] } | null>(null);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ summary: ImportSummary; errors: ImportRowPlan[] } | null>(null);
  const preview = useImportPreview();
  const commit = useImportCommit();
  const toast = useToast();

  const rows = file ? toImportRows(file.data, mapping) : [];
  const skuMapped = mapping.includes("sku");

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0];
    event.target.value = "";
    setResult(null);
    preview.reset();
    if (!f) return;
    if (f.size > MAX_BYTES) return setFileError("The file is larger than 5 MB. Split it into smaller files.");
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) return setFileError("The file needs a header row and at least one product row.");
    if (parsed.length - 1 > 5000) return setFileError("Import at most 5,000 rows at a time.");
    const [headers = [], ...data] = parsed;
    setFileError(null);
    setFile({ name: f.name, headers, data });
    setMapping(autoMap(headers));
  };

  const exportCsv = async () => {
    const response = await fetch("/api/products/export.csv", { credentials: "same-origin" });
    if (!response.ok) return toast("The export could not be downloaded. Try again.");
    download(`storiva-products-${new Date().toISOString().slice(0, 10)}.csv`, await response.text());
  };

  const errorReport = (plans: ImportRowPlan[]) =>
    download(
      "storiva-import-errors.csv",
      ["row,sku,field,problem", ...plans.flatMap((r) => r.errors.map((e) => [r.row, r.sku, e.field, e.message].map(csvCell).join(",")))].join("\n"),
    );

  return (
    <>
      <PageHeader title="Import & export" description="Download your products as a CSV file, or add and update many products at once." />

      <section className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="mt-1 mb-3 text-sm text-ink-muted">All products with barcodes, prices and quantities. The same columns can be imported back.</p>
        <Button variant="secondary" onClick={() => void exportCsv()}>
          <Download className="size-4" aria-hidden />
          Download CSV
        </Button>
      </section>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold">Import</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Products are matched by SKU: new SKUs are created, existing ones updated. Empty cells leave a value unchanged. Use “Quantity” to set stock, or “Adjust by” to add or remove units. Separate several barcodes with “;”.
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3.5 text-sm font-medium hover:bg-sunken">
          <Upload className="size-4" aria-hidden />
          Choose a CSV file
          <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} className="sr-only" />
        </label>
        {fileError && <Alert>{fileError}</Alert>}

        {file && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium">
                {file.name}: {file.data.length} {file.data.length === 1 ? "row" : "rows"}. Match the columns:
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {file.headers.map((h, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-32 truncate font-mono text-xs text-ink-muted" title={h}>{h || `(column ${i + 1})`}</span>
                    <select
                      value={mapping[i] ?? ""}
                      onChange={(e) => {
                        const next = [...mapping];
                        next[i] = (e.target.value || null) as ImportField | null;
                        setMapping(next);
                        preview.reset();
                      }}
                      className="min-w-0 flex-1 rounded-md border border-field bg-surface px-2 py-1.5 text-sm"
                      aria-label={`Storiva field for column ${h || i + 1}`}
                    >
                      <option value="">Ignore</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key} disabled={mapping.includes(f.key) && mapping[i] !== f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            {!skuMapped && <Alert>Match one column to SKU; it identifies each product.</Alert>}
            <Button variant="secondary" disabled={!skuMapped} loading={preview.isPending} loadingLabel="Checking…" onClick={() => preview.mutate(rows as Record<string, string>[])}>
              Preview changes
            </Button>
          </>
        )}
        {preview.isError && <Alert>{errorMessage(preview.error)}</Alert>}

        {preview.data && !result && (
          <div className="space-y-3">
            <p role="status" className="text-sm">
              <span className="font-medium">{preview.data.summary.create}</span> to create, <span className="font-medium">{preview.data.summary.update}</span> to update,{" "}
              {preview.data.summary.unchanged} unchanged, <span className={preview.data.summary.errors ? "font-medium text-danger" : ""}>{preview.data.summary.errors} with problems</span>
              {preview.data.summary.stockChanges > 0 && `; stock changes for ${preview.data.summary.stockChanges}`}.
            </p>
            <div className="max-h-96 overflow-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-line bg-sunken text-left text-xs text-ink-muted">
                  <tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">Details</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.data.rows.map((r) => (
                    <tr key={r.row} className={r.action === "error" ? "bg-danger-soft/40" : undefined}>
                      <td className="px-3 py-2 tabular-nums">{r.row}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku || "—"}</td>
                      <td className="px-3 py-2">{{ create: "Create", update: "Update", unchanged: "No change", error: "Skipped" }[r.action]}</td>
                      <td className="px-3 py-2 text-ink-muted">
                        {r.action === "error"
                          ? r.errors.map((e) => e.message).join(" ")
                          : r.changes.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={preview.data.summary.create + preview.data.summary.update === 0} onClick={() => setConfirming(true)}>
                Import {preview.data.summary.create + preview.data.summary.update} products…
              </Button>
              {preview.data.summary.errors > 0 && (
                <Button variant="secondary" onClick={() => errorReport(preview.data.rows.filter((r) => r.action === "error"))}>
                  Download problem rows
                </Button>
              )}
            </div>
          </div>
        )}

        {result && (
          <div role="status" className="space-y-2 rounded-md bg-ok-soft px-3 py-3 text-sm text-ok">
            <p>
              Imported: {result.summary.create} created, {result.summary.update} updated. {result.summary.errors > 0 && `${result.summary.errors} rows were skipped and listed in Exceptions.`}
            </p>
            {result.errors.length > 0 && <Button variant="secondary" onClick={() => errorReport(result.errors)}>Download error report</Button>}
          </div>
        )}
      </section>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Import these changes?">
        {preview.data && (
          <div className="mt-2 space-y-3 text-sm">
            <p className="text-ink-muted">
              {preview.data.summary.create} products will be created and {preview.data.summary.update} updated, all at once. If anything fails, nothing is changed. Rows with problems are skipped.
            </p>
            {commit.isError && <Alert>{errorMessage(commit.error)}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button
                loading={commit.isPending}
                loadingLabel="Importing…"
                onClick={() =>
                  file &&
                  commit.mutate(
                    { fileName: file.name, rows: rows as Record<string, string>[] },
                    { onSuccess: (r) => { setResult({ summary: r.summary, errors: r.errors }); setConfirming(false); toast("Import complete."); } },
                  )
                }
              >
                Import
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
