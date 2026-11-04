import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { errorMessage } from "../api/client";
import type { Product } from "../api/types";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ScanBarcodeButton } from "../scanner/ScanBarcodeButton";
import { useToast } from "../components/Toast";
import { useAttachBarcode, useRemoveBarcode } from "../hooks/useInventory";

export function ProductBarcodes({ product }: { product: Product }) {
  const [code, setCode] = useState("");
  const attach = useAttachBarcode();
  const remove = useRemoveBarcode();
  const toast = useToast();

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || attach.isPending) return;
    attach.mutate(
      { productId: product.id, code: code.trim() },
      {
        onSuccess: () => {
          toast("Barcode added.");
          setCode("");
        },
      },
    );
  };

  return (
    <section aria-labelledby="barcodes-heading" className="grid gap-x-10 gap-y-4 border-t border-line py-6 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 id="barcodes-heading" className="text-sm font-semibold">
          Barcodes
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Scanning any of these finds this product. Codes are unique within your inventory.</p>
      </div>
      <div className="max-w-xl space-y-3">
        {product.barcodes.length === 0 ? (
          <p className="text-sm text-ink-muted">No barcodes yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {product.barcodes.map((barcode) => (
              <li key={barcode.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm">{barcode.code}</span>
                  <span className="text-xs text-ink-muted">{barcode.kind === "gtin" ? "Retail barcode (EAN/UPC)" : "Other code"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate({ productId: product.id, barcodeId: barcode.id }, { onSuccess: () => toast("Barcode removed.") })}
                  disabled={remove.isPending}
                  aria-label={`Remove barcode ${barcode.code}`}
                  className="rounded-md p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} noValidate className="flex items-start gap-2">
          <TextField
            label="Add a barcode"
            name="newBarcode"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 [&_input]:font-mono"
            value={code}
            onValueChange={(v) => {
              setCode(v);
              attach.reset();
            }}
            error={attach.isError ? errorMessage(attach.error) : undefined}
            trailing={
              <ScanBarcodeButton
                onCode={(scannedCode) => {
                  setCode(scannedCode);
                  attach.reset();
                }}
              />
            }
          />
          <Button type="submit" variant="secondary" className="mt-7" disabled={!code.trim()} loading={attach.isPending} loadingLabel="Adding…">
            Add
          </Button>
        </form>
        {remove.isError && <p className="text-sm text-danger">{errorMessage(remove.error)}</p>}
      </div>
    </section>
  );
}
