import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck, PackageSearch, Plus, Repeat } from "lucide-react";
import { errorMessage } from "../api/client";
import type { BarcodeLookup, StockMovementSource, StockOperationRequest, StockOperationResult } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { StockStatus } from "../components/StockStatus";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { lookupBarcode, useStockOperation } from "../hooks/useInventory";
import { formatCount, pluralize } from "../lib/format";
import { BarcodeEntry } from "../scanner/BarcodeEntry";
import { CameraPanel } from "../scanner/CameraPanel";
import { scanFeedback } from "../scanner/feedback";
import { LinkBarcode } from "../scanner/LinkBarcode";
import { isScanMode, scanModes, type ScanMode } from "../scanner/modes";
import { StockActionForm } from "../scanner/StockActionForm";
import { useCameraScanner } from "../scanner/useCameraScanner";

interface CurrentScan {
  id: number;
  code: string;
  format?: string;
  source: StockMovementSource;
  state: "loading" | "ready" | "error" | "done";
  lookup?: BarcodeLookup;
  error?: string;
  result?: StockOperationResult;
}

interface HistoryEntry {
  id: number;
  code: string;
  product: string | null;
  outcome: string;
  at: Date;
}

const outcomeOf = (result: StockOperationResult) => {
  const { type, quantityBefore, quantityAfter, quantityChange } = result.movement;
  const verb = type === "receive" ? "Received" : type === "issue" ? "Issued" : "Counted";
  const amount = type === "count" ? `${formatCount(quantityAfter)} (difference ${quantityChange > 0 ? "+" : ""}${quantityChange})` : formatCount(Math.abs(quantityChange));
  return `${verb} ${amount} · ${formatCount(quantityBefore)} → ${formatCount(quantityAfter)}`;
};

export function ScanPage() {
  useDocumentTitle("Scan");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode: ScanMode = isScanMode(params.get("mode")) ? (params.get("mode") as ScanMode) : "find";
  const [continuous, setContinuous] = useState(false);
  const [current, setCurrent] = useState<CurrentScan | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [focusSignal, setFocusSignal] = useState(0);
  const nextId = useRef(1);
  const quickOperation = useStockOperation();
  const resultRef = useRef<HTMLElement>(null);

  // On a phone the result sits below the camera; bring it into view once a scan has resolved.
  const shownScan = current && current.state !== "loading" ? current.id : null;
  useEffect(() => {
    if (shownScan !== null && window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [shownScan]);

  const canRunContinuously = mode === "receive" || mode === "issue";
  const runContinuously = continuous && canRunContinuously;

  const remember = useCallback((entry: Omit<HistoryEntry, "at">) => {
    setHistory((list) => [{ ...entry, at: new Date() }, ...list].slice(0, 20));
  }, []);

  // Assigned below once the camera exists; scans call it through this ref.
  const handleScanRef = useRef<(code: string, format: string | undefined, source: StockMovementSource) => void>(() => undefined);
  const camera = useCameraScanner((code, format) => handleScanRef.current(code, format, "camera"));

  const handleScan = async (code: string, format: string | undefined, source: StockMovementSource) => {
    const id = nextId.current++;
    if (!runContinuously) camera.setPaused(true);
    setCurrent({ id, code, format, source, state: "loading" });

    let lookup: BarcodeLookup;
    try {
      lookup = await lookupBarcode(code, format);
    } catch (error) {
      scanFeedback("error");
      setCurrent({ id, code, format, source, state: "error", error: errorMessage(error) });
      remember({ id, code, product: null, outcome: "Not a valid barcode" });
      return;
    }

    if (runContinuously && lookup.product) {
      const request: StockOperationRequest = {
        type: mode as "receive" | "issue",
        quantity: 1,
        productId: lookup.product.id,
        source,
        note: null,
        idempotencyKey: crypto.randomUUID(),
      };
      try {
        const result = await quickOperation.mutateAsync(request);
        scanFeedback("success");
        setCurrent({ id, code, format, source, state: "done", lookup, result });
        remember({ id, code, product: lookup.product.name, outcome: outcomeOf(result) });
      } catch (error) {
        // Stop the run so the problem (e.g. no stock left to issue) is noticed.
        scanFeedback("error");
        camera.setPaused(true);
        setCurrent({ id, code, format, source, state: "error", lookup, error: errorMessage(error) });
        remember({ id, code, product: lookup.product.name, outcome: errorMessage(error) });
      }
      return;
    }

    scanFeedback(lookup.product ? "success" : "error");
    setCurrent({ id, code, format, source, state: "ready", lookup });
    remember({
      id,
      code,
      product: lookup.product?.name ?? null,
      outcome: lookup.product ? (mode === "find" ? "Found" : "Identified") : "Not in your inventory",
    });
  };
  useEffect(() => {
    handleScanRef.current = (code, format, source) => void handleScan(code, format, source);
  });

  const scanNext = () => {
    setCurrent(null);
    camera.setPaused(false);
    setFocusSignal((n) => n + 1);
  };

  const refreshCurrent = async () => {
    if (!current) return;
    const lookup = await lookupBarcode(current.code, current.format).catch(() => current.lookup);
    setCurrent({ ...current, lookup, state: "ready" });
  };

  const setMode = (next: ScanMode) => {
    setParams(next === "find" ? {} : { mode: next }, { replace: true });
    setCurrent(null);
    camera.setPaused(false);
  };

  return (
    <>
      <PageHeader title="Scan" description={scanModes.find((m) => m.value === mode)?.hint} />

      <div role="radiogroup" aria-label="What a scan does" className="mb-4 grid grid-cols-5 gap-1 rounded-md bg-sunken p-1">
        {scanModes.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`rounded px-1 py-2 text-center text-sm font-medium transition-colors ${
              mode === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <CameraPanel scanner={camera} />
          <BarcodeEntry onSubmit={(code, source) => handleScanRef.current(code, undefined, source)} focusSignal={focusSignal} />
          {canRunContinuously && (
            <label className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
              <input
                type="checkbox"
                checked={continuous}
                onChange={(e) => setContinuous(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Repeat className="size-4" aria-hidden />
                  Continuous scanning
                </span>
                <span className="text-ink-muted">
                  Each scan {mode === "receive" ? "adds" : "removes"} 1 unit straight away. Move the item out of view
                  before scanning it again.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="space-y-5">
          <section
            ref={resultRef}
            aria-live="polite"
            aria-label="Scan result"
            className="scroll-mt-20 rounded-lg border border-line bg-surface p-4 sm:p-5"
          >
            {!current ? (
              <div className="py-6 text-center text-sm text-ink-muted">
                <PackageSearch className="mx-auto mb-2 size-6 text-ink-faint" aria-hidden />
                Scan a barcode or type one in. The result appears here.
              </div>
            ) : (
              <ScanResultView
                key={current.id}
                scan={current}
                mode={mode}
                onDone={(result) => {
                  setCurrent({ ...current, state: "done", result });
                  setHistory((list) =>
                    list.map((entry) => (entry.id === current.id ? { ...entry, outcome: outcomeOf(result) } : entry)),
                  );
                }}
                onStale={() => void refreshCurrent()}
                onLinked={() => void refreshCurrent()}
                onCreate={() => navigate(`/products/new?barcode=${encodeURIComponent(current.code)}`)}
                onNext={scanNext}
                continuous={runContinuously}
              />
            )}
          </section>

          <section aria-labelledby="scan-history-heading">
            <h2 id="scan-history-heading" className="mb-2 text-sm font-semibold">
              This session
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-ink-muted">Scans you make on this page are listed here until you leave it.</p>
            ) : (
              <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.product ?? "Unknown product"}</p>
                      <p className="truncate font-mono text-xs text-ink-muted">{entry.code}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-ink-muted">{entry.outcome}</p>
                      <p className="text-xs text-ink-faint">{entry.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

interface ScanResultViewProps {
  scan: CurrentScan;
  mode: ScanMode;
  continuous: boolean;
  onDone: (result: StockOperationResult) => void;
  onStale: () => void;
  onLinked: () => void;
  onCreate: () => void;
  onNext: () => void;
}

function ScanResultView({ scan, mode, continuous, onDone, onStale, onLinked, onCreate, onNext }: ScanResultViewProps) {
  const [linking, setLinking] = useState(false);
  const product = scan.lookup?.product ?? null;
  const next = (
    <Button variant={scan.state === "done" ? "primary" : "secondary"} onClick={onNext} className="w-full" autoFocus={scan.state === "done"}>
      Scan next
    </Button>
  );

  if (scan.state === "loading") return <LoadingState label={`Looking up ${scan.code}…`} />;

  if (scan.state === "error" && !product) {
    return (
      <div className="space-y-4">
        <Alert>{scan.error}</Alert>
        <p className="font-mono text-sm text-ink-muted">{scan.code}</p>
        {next}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Not in your inventory</h2>
          <p className="mt-1 text-sm text-ink-muted">
            No product uses <span className="font-mono text-ink">{scan.code}</span> yet.
          </p>
        </div>
        <Button onClick={onCreate} className="w-full">
          <Plus className="size-4" aria-hidden />
          Create a product with this barcode
        </Button>
        {linking ? (
          <LinkBarcode code={scan.code} format={scan.format} onLinked={onLinked} />
        ) : (
          <Button variant="secondary" onClick={() => setLinking(true)} className="w-full">
            Add it to an existing product
          </Button>
        )}
        {next}
      </div>
    );
  }

  const summary = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/products/${product.id}/edit`} className="block truncate text-base font-semibold hover:text-accent hover:underline">
          {product.name}
        </Link>
        <p className="font-mono text-xs text-ink-muted">
          {product.sku} · {scan.lookup?.matchedBy === "sku" ? "matched by SKU" : scan.code}
        </p>
        <p className="mt-1 text-sm text-ink-muted">{pluralize(product.quantityOnHand, "unit")} on hand</p>
      </div>
      <StockStatus quantity={product.quantityOnHand} threshold={product.effectiveThreshold} />
    </div>
  );

  if (scan.state === "done" && scan.result) {
    return (
      <div className="space-y-4">
        {summary}
        <p role="status" className="flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {outcomeOf(scan.result)}
        </p>
        {continuous ? <p className="text-sm text-ink-muted">Scanning continues. Scan the next item.</p> : next}
      </div>
    );
  }

  if (scan.state === "error") {
    return (
      <div className="space-y-4">
        {summary}
        <Alert>{scan.error}</Alert>
        {next}
      </div>
    );
  }

  if (mode === "find" || mode === "add") {
    return (
      <div className="space-y-4">
        {mode === "add" && <p className="text-sm font-medium text-warn">This barcode is already in your inventory.</p>}
        {summary}
        <Link
          to={`/products/${product.id}/edit`}
          className="flex h-9 w-full items-center justify-center rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover"
        >
          Open product
        </Link>
        {next}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary}
      <StockActionForm type={mode} product={product} source={scan.source} onDone={onDone} onStale={onStale} />
      <Button variant="ghost" onClick={onNext} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

