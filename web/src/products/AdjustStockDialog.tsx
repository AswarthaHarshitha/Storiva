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
import { planAdjustment, type Direction } from "./stockAdjustment";

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
  const [showError, setShowError] = useState(false);
  const adjust = useAdjustStock();
  const toast = useToast();

  const plan = planAdjustment(product.quantityOnHand, direction, units);
  // Going below zero is worth flagging as soon as it happens; other problems wait for submit.
  const fieldError = showError || (plan.resulting !== null && plan.resulting < 0) ? plan.error : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (adjust.isPending) return;
    if (plan.error || plan.delta === null) {
      setShowError(true);
      return;
    }
    adjust.mutate(
      { id: product.id, delta: plan.delta, note: note.trim() || null },
      {
        onSuccess: (updated) => {
          toast(`${updated.name}: ${formatCount(product.quantityOnHand)} → ${pluralize(updated.quantityOnHand, "unit")}.`);
          onDone();
        },
      },
    );
  };

  const amount = plan.delta === null ? null : Math.abs(plan.delta);

  return (
    <form onSubmit={submit} noValidate className="mt-1 space-y-4">
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{product.name}</span> · <span className="font-mono text-xs">{product.sku}</span>
      </p>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Change</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
          {(["add", "remove"] as const).map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                direction === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="direction"
                value={option}
                checked={direction === option}
                onChange={() => setDirection(option)}
                className="sr-only"
              />
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
          setShowError(false);
        }}
        error={fieldError ?? undefined}
      />

      <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line text-center" aria-live="polite">
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">On hand</dt>
          <dd className="font-medium tabular-nums">{formatCount(product.quantityOnHand)}</dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">Change</dt>
          <dd className={`font-medium tabular-nums ${plan.delta === null ? "text-ink-faint" : plan.delta > 0 ? "text-ok" : "text-danger"}`}>
            {plan.delta === null ? "—" : `${plan.delta > 0 ? "+" : "−"}${formatCount(Math.abs(plan.delta))}`}
          </dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">New quantity</dt>
          <dd className={`font-semibold tabular-nums ${plan.resulting !== null && plan.resulting < 0 ? "text-danger" : ""}`}>
            {plan.resulting === null ? "—" : formatCount(plan.resulting)}
          </dd>
        </div>
      </dl>

      <TextField
        label="Note"
        name="note"
        maxLength={200}
        value={note}
        onValueChange={setNote}
        hint="Optional. Saved with the product as its latest stock note."
      />

      {adjust.isError && <Alert>{errorMessage(adjust.error)}</Alert>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={adjust.isPending} loadingLabel="Saving…">
          {amount === null || plan.error
            ? "Update stock"
            : `${direction === "add" ? "Add" : "Remove"} ${pluralize(amount, "unit")}`}
        </Button>
      </div>
    </form>
  );
}
