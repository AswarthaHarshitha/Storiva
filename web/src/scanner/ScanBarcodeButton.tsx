import { lazy, Suspense, useState } from "react";
import { ScanLine } from "lucide-react";

// The camera and decoder load only when someone actually scans.
const CameraScanDialog = lazy(() => import("./CameraScanDialog"));

/** A camera button for a barcode field. */
export function ScanBarcodeButton({ onCode }: { onCode: (code: string, format: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded p-1.5 text-ink-faint hover:text-ink"
        aria-label="Scan with the camera"
        title="Scan with the camera"
      >
        <ScanLine className="size-4" aria-hidden />
      </button>
      {open && (
        <Suspense fallback={null}>
          <CameraScanDialog onCode={onCode} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
