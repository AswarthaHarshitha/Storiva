import { useState, type FormEvent } from "react";
import { ApiError, errorMessage } from "../api/client";
import type { Product, StockMovementSource, StockOperationResult } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { useStockOperation } from "../hooks/useInventory";
import { formatCount, pluralize } from "../lib/format";

interface StockActionFormProps {
  type: "receive" | "issue" | "count";
  product: Product;
  source: StockMovementSource;
  onDone: (result: StockOperationResult) => void;
  /** Called when the server reports a newer quantity, so the caller can refresh the product. */
  onStale: () => void;
}

const WHOLE = /^\d+$/;

export function StockActionForm({ type, product, source, onDone, onStale }: StockActionFormProps) {
  const [value, setValue] = useState(type === "count" ? "" : "1");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  // One key per action: a retry after a dropped connection repeats the key, so the server
  // returns the first result instead of applying the change twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const operation = useStockOperation();

  const onHand = product.quantityOnHand;
  const amount = WHOLE.test(value.trim()) ? Number(value.trim()) : null;
  const resulting = amount === null ? null : type === "receive" ? onHand + amount : type === "issue" ? onHand - amount : amount;
  const change = resulting === null ? null : resulting - onHand;

  const problem =
    amount === null
      ? value.trim() === ""
        ? type === "count"
          ? "Enter the quantity you counted."
          : "Enter how many units."
        : "Enter a whole number."
      : type !== "count" && amount === 0
        ? "Enter at least 1 unit."
        : resulting !== null && resulting < 0
          ? `You can issue at most ${pluralize(onHand, "unit")}.`
          : null;
  const fieldError = showErrors || (resulting !== null && resulting < 0) ? problem : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (operation.isPending) return;
    if (problem || amount === null) {
      setShowErrors(true);
      return;
    }
    const base = { productId: product.id, source, note: note.trim() || null, idempotencyKey };
    operation.mutate(
      type === "count"
        ? { ...base, type, countedQuantity: amount, expectedQuantity: onHand }
        : { ...base, type, quantity: amount },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (error instanceof ApiError && error.code === "QUANTITY_CHANGED") onStale();
        },
      },
    );
  };

  const label = type === "count" ? "Counted quantity" : type === "receive" ? "Units received" : "Units issued";
  const action =
    amount === null || problem
      ? type === "count"
        ? "Confirm count"
        : type === "receive"
          ? "Receive"
          : "Issue"
      : type === "count"
        ? `Confirm count of ${formatCount(amount)}`
        : `${type === "receive" ? "Receive" : "Issue"} ${pluralize(amount, "unit")}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label={label}
        name="quantity"
        inputMode="numeric"
        autoComplete="off"
        required
        autoFocus
        value={value}
        onValueChange={(v) => {
          setValue(v);
          setShowErrors(false);
        }}
        error={fieldError ?? undefined}
      />

      <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line text-center" aria-live="polite">
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">{type === "count" ? "System quantity" : "On hand"}</dt>
          <dd className="font-medium tabular-nums">{formatCount(onHand)}</dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">{type === "count" ? "Difference" : "Change"}</dt>
          <dd
            className={`font-medium tabular-nums ${
              change === null || change === 0 ? "text-ink-faint" : change > 0 ? "text-ok" : "text-danger"
            }`}
          >
            {change === null ? "—" : change === 0 ? "0" : `${change > 0 ? "+" : "−"}${formatCount(Math.abs(change))}`}
          </dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-xs text-ink-muted">New quantity</dt>
          <dd className={`font-semibold tabular-nums ${resulting !== null && resulting < 0 ? "text-danger" : ""}`}>
            {resulting === null ? "—" : formatCount(resulting)}
          </dd>
        </div>
      </dl>

      {type === "count" && change !== null && change !== 0 && !problem && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          Your count differs from the system by {pluralize(Math.abs(change), "unit")}. Confirming sets the stock to{" "}
          {formatCount(amount ?? 0)} and records the difference.
        </p>
      )}

      <TextField
        label="Note"
        name="note"
        maxLength={200}
        value={note}
        onValueChange={setNote}
        hint={type === "receive" ? "Optional, e.g. a delivery or invoice number." : "Optional."}
      />

      {operation.isError && <Alert>{errorMessage(operation.error)}</Alert>}

      <Button type="submit" className="w-full" loading={operation.isPending} loadingLabel="Saving…">
        {action}
      </Button>
    </form>
  );
}
