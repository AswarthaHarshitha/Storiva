import { useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import type { Product } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useAdjustStock } from "../hooks/useInventory";
import { formatCount, pluralize } from "../lib/format";

type Direction = "add" | "remove";

export function AdjustStockDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Dialog open={product !== null} onClose={onClose} title="Adjust stock">
      {product && <AdjustStockForm key={product.id} product={product} onDone={onClose} />}
    </Dialog>
  );
}

function AdjustStockForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const [direction, setDirection] = useState<Direction>("add");
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const adjust = useAdjustStock();
  const toast = useToast();

  const amount = /^\d+$/.test(units.trim()) ? Number(units) : null;
  const delta = amount === null ? null : direction === "add" ? amount : -amount;
  const resulting = delta === null ? null : product.quantityOnHand + delta;

  const check = (): string | undefined => {
    if (units.trim() === "") return "Enter how many units.";
    if (amount === null) return "Enter a whole number of units.";
    if (amount === 0) return "Enter at least 1 unit.";
    if (resulting !== null && resulting < 0) return `Only ${pluralize(product.quantityOnHand, "unit")} on hand.`;
    return undefined;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = check();
    setError(problem);
    if (problem || delta === null) return;
    adjust.mutate(
      { id: product.id, delta, note: note.trim() || null },
      {
        onSuccess: (updated) => {
          toast(`${updated.name} now has ${pluralize(updated.quantityOnHand, "unit")}.`);
          onDone();
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="mt-1 space-y-4">
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{product.name}</span> · {pluralize(product.quantityOnHand, "unit")} on hand
      </p>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Change</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
          {(["add", "remove"] as const).map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                direction === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted"
              }`}
            >
              <input type="radio" name="direction" value={option} checked={direction === option} onChange={() => setDirection(option)} className="sr-only" />
              {option === "add" ? "Add units" : "Remove units"}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label="Units"
        name="units"
        inputMode="numeric"
        autoComplete="off"
        required
        autoFocus
        value={units}
        onValueChange={(value) => {
          setUnits(value);
          if (error) setError(undefined);
        }}
        error={error}
        hint={resulting !== null && resulting >= 0 && amount ? `New quantity: ${formatCount(resulting)}` : undefined}
      />
      <TextField label="Note" name="note" maxLength={200} value={note} onValueChange={setNote} hint="Optional, e.g. “Delivery from supplier”." />

      {adjust.isError && !error && <Alert>{errorMessage(adjust.error)}</Alert>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={adjust.isPending} loadingLabel="Saving…">
          Update stock
        </Button>
      </div>
    </form>
  );
}
