import { useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react";
import type { ParsedInvoice, Receipt, ReceiptPayload } from "../api/advanced";
import { ApiError, errorMessage } from "../api/client";
import { ProductPicker } from "../advanced/ProductPicker";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useConfirmReceipt, useDeleteReceipt, useParseInvoice, useReceipt, useSaveReceipt, useSuppliers } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { checkImageFile, readText } from "../ocr/ocr";

interface Line {
  key: number;
  product: { id: string; name: string; sku: string } | null;
  description: string;
  expected: string;
  received: string;
  damaged: string;
  unitCost: string;
  updateCost: boolean;
  confidence: string | null;
  candidates: { productId: string; name: string; sku: string; confidence: string; reason: string }[];
}

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, product: null, description: "", expected: "", received: "", damaged: "0", unitCost: "", updateCost: false, confidence: null, candidates: [] });

const backLink = (
  <Link to="/receiving" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
    <ArrowLeft className="size-4" aria-hidden />
    Receiving
  </Link>
);

export function ReceiptPage() {
  const { id } = useParams();
  const receipt = useReceipt(id);
  useDocumentTitle(id ? "Receipt" : "New receipt");
  if (id && receipt.isPending) return <>{backLink}<LoadingState label="Loading receipt…" /></>;
  if (id && receipt.isError) return <>{backLink}<QueryError error={receipt.error} onRetry={() => void receipt.refetch()} /></>;
  return <ReceiptEditor key={receipt.data?.id ?? "new"} receipt={receipt.data ?? null} />;
}

function ReceiptEditor({ receipt }: { receipt: Receipt | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const suppliers = useSuppliers();
  const save = useSaveReceipt(receipt?.id);
  const confirm = useConfirmReceipt();
  const remove = useDeleteReceipt();
  const parse = useParseInvoice();
  const readOnly = receipt?.status === "confirmed";

  const [supplierId, setSupplierId] = useState(receipt?.supplierId ?? "");
  const [reference, setReference] = useState(receipt?.reference ?? "");
  const [documentDate, setDocumentDate] = useState(receipt?.documentDate ?? "");
  const [expectedDate, setExpectedDate] = useState(receipt?.expectedDate ?? "");
  const [total, setTotal] = useState(receipt?.totalAmount ?? "");
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  const [source, setSource] = useState<"manual" | "invoice">(receipt?.source ?? "manual");
  const [documentText, setDocumentText] = useState(receipt?.documentText ?? "");
  const [lines, setLines] = useState<Line[]>(
    receipt?.lines.length
      ? receipt.lines.map((l) => ({
          key: nextKey++,
          product: l.product ? { id: l.product.id, name: l.product.name, sku: l.product.sku } : null,
          description: l.description,
          expected: l.expectedQuantity?.toString() ?? "",
          received: String(l.receivedQuantity),
          damaged: String(l.damagedQuantity),
          unitCost: l.unitCost ?? "",
          updateCost: l.updateCost,
          confidence: l.matchConfidence,
          candidates: [],
        }))
      : [emptyLine()],
  );
  const [ocr, setOcr] = useState<{ state: "idle" | "reading" | "done" | "error"; message?: string; confidence?: number }>({ state: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = checkImageFile(file);
    if (invalid) return setOcr({ state: "error", message: invalid });
    setOcr({ state: "reading" });
    try {
      const result = await readText(file);
      setDocumentText(result.text);
      setSource("invoice");
      setOcr({ state: "done", confidence: result.confidence });
    } catch {
      setOcr({ state: "error", message: "The photo could not be read. Try a sharper, well-lit photo, or paste the invoice text." });
    }
  };

  const applyParsed = (p: ParsedInvoice) => {
    if (p.invoiceNumber) setReference(p.invoiceNumber);
    if (p.date) setDocumentDate(p.date);
    if (p.total) setTotal(p.total);
    if (p.supplierMatch) setSupplierId(p.supplierMatch.id);
    if (p.lines.length > 0) {
      setLines(
        p.lines.map((l) => {
          const top = l.matches[0];
          const sure = top && (top.confidence === "exact" || top.confidence === "high");
          return {
            ...emptyLine(),
            description: l.description,
            received: String(l.quantity),
            expected: String(l.quantity),
            unitCost: l.unitCost ?? "",
            product: sure ? { id: top.productId, name: top.name, sku: top.sku } : null,
            confidence: sure ? top.confidence : null,
            candidates: l.matches,
          };
        }),
      );
    }
    setSource("invoice");
  };

  const payload = (): ReceiptPayload | null => {
    const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : null);
    const out: ReceiptPayload["lines"] = [];
    for (const [i, l] of lines.entries()) {
      if (!l.description.trim() && !l.product) continue;
      const received = whole(l.received);
      const damaged = l.damaged.trim() ? whole(l.damaged) : 0;
      if (received === null) return setProblem(`Line ${i + 1}: enter the number of units received.`), null;
      if (damaged === null || damaged > received) return setProblem(`Line ${i + 1}: damaged units must be a whole number no larger than received.`), null;
      if (l.expected.trim() && whole(l.expected) === null) return setProblem(`Line ${i + 1}: expected units must be a whole number.`), null;
      if (l.unitCost.trim() && !/^\d{1,10}(\.\d{1,2})?$/.test(l.unitCost.trim())) return setProblem(`Line ${i + 1}: unit cost must be an amount like 12.50.`), null;
      out.push({
        productId: l.product?.id ?? null,
        description: (l.description || l.product?.name || "").trim(),
        expectedQuantity: l.expected.trim() ? whole(l.expected) : null,
        receivedQuantity: received,
        damagedQuantity: damaged,
        unitCost: l.unitCost.trim() || null,
        updateCost: l.updateCost && Boolean(l.unitCost.trim()),
        matchConfidence: l.product ? (l.confidence ?? "manual") : null,
      });
    }
    if (out.length === 0) return setProblem("Add at least one line."), null;
    setProblem(null);
    return {
      supplierId: supplierId || null,
      reference: reference.trim() || null,
      documentDate: documentDate || null,
      expectedDate: expectedDate || null,
      source,
      documentText: documentText || null,
      totalAmount: total.trim() || null,
      notes: notes.trim() || null,
      lines: out,
    };
  };

  const saveDraft = (then?: (saved: Receipt) => void) => {
    const body = payload();
    if (!body || save.isPending) return;
    save.mutate(body, {
      onSuccess: (saved) => {
        if (then) then(saved);
        else {
          toast("Draft saved.");
          if (!receipt) void navigate(`/receiving/${saved.id}`, { replace: true });
        }
      },
    });
  };

  const usable = lines.filter((l) => l.product && /^\d+$/.test(l.received)).map((l) => ({ name: l.product?.name ?? "", units: Number(l.received) - Number(l.damaged || 0), cost: l.updateCost ? l.unitCost : null }));
  const unmatched = lines.filter((l) => !l.product && l.description.trim()).length;

  return (
    <>
      {backLink}
      <PageHeader
        title={receipt ? `Receipt ${receipt.reference ?? ""}`.trim() : "New receipt"}
        description={readOnly ? `Confirmed ${new Date(receipt.confirmedAt ?? "").toLocaleString()}. Stock was updated then; confirmed receipts cannot be changed.` : "Fill this in by hand, or read an invoice photo. Nothing changes stock until you confirm."}
      />

      {!readOnly && (
        <section className="mb-6 space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Read an invoice</h2>
          <p className="text-sm text-ink-muted">Text is read on this device; the photo is not uploaded. Always check what was read.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium hover:bg-sunken">
              <FileText className="size-4" aria-hidden />
              Choose or take a photo
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => void onPhoto(e)} className="sr-only" />
            </label>
            {ocr.state === "reading" && <span role="status" className="text-sm text-ink-muted">Reading the photo… this can take a few seconds the first time.</span>}
            {ocr.state === "done" && <span role="status" className="text-sm text-ink-muted">Read with {ocr.confidence}% average word confidence. Check the text below.</span>}
          </div>
          {ocr.state === "error" && <Alert>{ocr.message}</Alert>}
          <TextField label="Invoice text" name="documentText" multiline value={documentText} onValueChange={setDocumentText} hint="Read from the photo, or paste the text of an emailed invoice. Correct anything misread." />
          <Button variant="secondary" disabled={!documentText.trim()} loading={parse.isPending} loadingLabel="Reading…" onClick={() => parse.mutate(documentText, { onSuccess: applyParsed })}>
            Fill the receipt from this text
          </Button>
          {parse.data && (
            <p role="status" className="text-sm text-ink-muted">
              Found {parse.data.lines.length} {parse.data.lines.length === 1 ? "line" : "lines"}
              {parse.data.unreadLines.length > 0 && `; ${parse.data.unreadLines.length} more could not be read reliably and were left out`}. Lines matched with low confidence are left for you to choose.
            </p>
          )}
          {parse.isError && <Alert>{errorMessage(parse.error)}</Alert>}
        </section>
      )}

      <fieldset disabled={readOnly} className="space-y-6">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="supplier" className="mb-1.5 block text-sm font-medium">Supplier</label>
            <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="block w-full rounded-md border border-field bg-surface px-3 py-2 text-sm">
              <option value="">No supplier</option>
              {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!readOnly && <Link to="/suppliers" className="mt-1 inline-block text-xs text-accent hover:underline">Manage suppliers</Link>}
          </div>
          <TextField label="Reference" name="reference" value={reference} onValueChange={setReference} hint="Invoice or purchase order number." />
          <TextField label="Invoice date" name="documentDate" type="date" value={documentDate} onValueChange={setDocumentDate} />
          <TextField label="Due date" name="expectedDate" type="date" value={expectedDate} onValueChange={setExpectedDate} hint="When the delivery was expected; used for supplier reliability." />
          <TextField label="Invoice total" name="total" inputMode="decimal" value={total} onValueChange={setTotal} />
          <TextField label="Notes" name="notes" value={notes} onValueChange={setNotes} />
        </div>

        <section aria-labelledby="lines-heading">
          <h2 id="lines-heading" className="mb-2 text-sm font-semibold">Lines</h2>
          <ul className="space-y-3">
            {lines.map((l, i) => (
              <li key={l.key} className="rounded-lg border border-line bg-surface p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-ink-muted">Product (line {i + 1})</span>
                    {readOnly ? (
                      <span className="text-sm font-medium">{l.product?.name ?? <span className="text-warn">Not matched — not added to stock</span>}</span>
                    ) : (
                      <ProductPicker label={`line ${i + 1}`} value={l.product} onChange={(p) => update(l.key, { product: p, confidence: p ? "manual" : null })} />
                    )}
                    {l.confidence && l.confidence !== "manual" && <span className="mt-1 inline-block rounded bg-sunken px-1.5 text-xs text-ink-muted">Matched: {l.confidence} confidence</span>}
                    {!readOnly && !l.product && l.candidates.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 text-xs">
                        <span className="text-ink-muted">Possible:</span>
                        {l.candidates.map((c) => (
                          <button key={c.productId} type="button" title={c.reason} onClick={() => update(l.key, { product: { id: c.productId, name: c.name, sku: c.sku }, confidence: c.confidence })} className="rounded border border-line-strong px-1.5 hover:bg-sunken">
                            {c.name} ({c.confidence})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!readOnly && lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} className="rounded p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <TextField label="Description" name={`d${l.key}`} className="col-span-2" value={l.description} onValueChange={(v) => update(l.key, { description: v })} />
                  <TextField label="Expected" name={`e${l.key}`} inputMode="numeric" value={l.expected} onValueChange={(v) => update(l.key, { expected: v })} />
                  <TextField label="Received" name={`r${l.key}`} inputMode="numeric" value={l.received} onValueChange={(v) => update(l.key, { received: v })} />
                  <TextField label="Damaged" name={`x${l.key}`} inputMode="numeric" value={l.damaged} onValueChange={(v) => update(l.key, { damaged: v })} />
                  <TextField label="Unit cost" name={`c${l.key}`} inputMode="decimal" value={l.unitCost} onValueChange={(v) => update(l.key, { unitCost: v })} />
                </div>
                {l.expected && l.received && l.expected !== l.received && <p className="mt-2 text-xs text-warn">Received differs from expected by {Number(l.received) - Number(l.expected)}.</p>}
                <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={l.updateCost} onChange={(e) => update(l.key, { updateCost: e.target.checked })} className="accent-[var(--color-accent)]" />
                  Update the product's cost price to this unit cost
                </label>
              </li>
            ))}
          </ul>
          {!readOnly && (
            <Button variant="ghost" className="mt-2" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus className="size-4" aria-hidden />
              Add line
            </Button>
          )}
        </section>
      </fieldset>

      {problem && <div className="mt-4"><Alert>{problem}</Alert></div>}
      {save.isError && <div className="mt-4"><Alert>{errorMessage(save.error)}</Alert></div>}

      {!readOnly && (
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {receipt ? (
            <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => remove.mutate(receipt.id, { onSuccess: () => void navigate("/receiving") })}>
              Delete draft
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => saveDraft()} loading={save.isPending && !confirming} loadingLabel="Saving…">
              Save draft
            </Button>
            <Button onClick={() => payload() && setConfirming(true)}>Review and confirm…</Button>
          </div>
        </div>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Confirm this receipt?">
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-ink-muted">These stock changes will be made. A confirmed receipt cannot be edited.</p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {usable.map((u, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2">
                <span>{u.name}</span>
                <span className="text-ok tabular-nums">+{u.units}{u.cost ? ` · cost → ${u.cost}` : ""}</span>
              </li>
            ))}
          </ul>
          {unmatched > 0 && <p className="text-warn">{unmatched} unmatched {unmatched === 1 ? "line is" : "lines are"} recorded but not added to stock.</p>}
          {confirm.isError && <Alert>{confirm.error instanceof ApiError ? confirm.error.message : errorMessage(confirm.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              loading={save.isPending || confirm.isPending}
              loadingLabel="Confirming…"
              onClick={() =>
                saveDraft((saved) =>
                  confirm.mutate(saved.id, {
                    onSuccess: () => {
                      toast("Receipt confirmed and stock updated.");
                      setConfirming(false);
                      void navigate(`/receiving/${saved.id}`, { replace: true });
                    },
                  }),
                )
              }
            >
              Confirm receipt
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
