import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanBarcode } from "lucide-react";
import { Button } from "../components/Button";
import { looksLikeHardwareScanner } from "./dedupe";

interface BarcodeEntryProps {
  onSubmit: (code: string, source: "manual" | "scanner") => void;
  /** Changing this value re-focuses the field, e.g. after a scan has been dealt with. */
  focusSignal: number;
}

const prefersPointer = () => window.matchMedia("(pointer: fine)").matches;

/**
 * The input for typed codes and for USB/Bluetooth scanners, which behave as keyboards: they type
 * the code and press Enter. Keystroke timing tells the two apart for the record's source.
 */
export function BarcodeEntry({ onSubmit, focusSignal }: BarcodeEntryProps) {
  const [value, setValue] = useState("");
  const keyTimes = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field focused on desktops so a hardware scanner works without clicking first.
  // On touch devices focusing would open the on-screen keyboard, so it is left alone.
  useEffect(() => {
    if (prefersPointer()) inputRef.current?.focus();
  }, [focusSignal]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = value.trim();
    if (!code) return;
    onSubmit(code, looksLikeHardwareScanner(keyTimes.current, code.length) ? "scanner" : "manual");
    setValue("");
    keyTimes.current = [];
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-4">
      <label htmlFor="barcode-entry" className="mb-1.5 block text-sm font-medium">
        Barcode
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            id="barcode-entry"
            value={value}
            onChange={(e) => {
              if (e.target.value === "") keyTimes.current = [];
              setValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key.length === 1) keyTimes.current.push(performance.now());
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-describedby="barcode-entry-hint"
            className="block w-full rounded-md border border-field bg-surface py-2 pr-3 pl-9 font-mono text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!value.trim()}>
          Look up
        </Button>
      </div>
      <p id="barcode-entry-hint" className="mt-1.5 text-sm text-ink-muted">
        Type a code and press Enter, or scan with a USB or Bluetooth scanner.
      </p>
    </form>
  );
}
