import { useEffect } from "react";
import { Dialog } from "../components/Dialog";
import { Button } from "../components/Button";
import { CameraPanel } from "./CameraPanel";
import { useCameraScanner } from "./useCameraScanner";
import { scanFeedback } from "./feedback";

/** A camera in a dialog that reads one barcode, hands it back and closes. */
export default function CameraScanDialog({ onCode, onClose }: { onCode: (code: string, format: string) => void; onClose: () => void }) {
  // Closing unmounts the dialog, which stops the camera.
  const scanner = useCameraScanner((code, format) => {
    scanFeedback("success");
    onCode(code, format);
    onClose();
  });
  const { start, stop } = scanner;

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  return (
    <Dialog open onClose={onClose} title="Scan a barcode">
      <p className="mt-1 mb-3 text-sm text-ink-muted">Point the camera at the barcode. It is filled in as soon as it is read.</p>
      <CameraPanel scanner={scanner} />
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
