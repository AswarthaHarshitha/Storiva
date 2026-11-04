import { Link, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../api/client";
import type { CatalogueLookup, Product } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { TextField } from "../components/TextField";
import { useForm } from "../hooks/useForm";
import { useCatalogueLookup, useSaveProduct, useSettings } from "../hooks/useInventory";
import { draftFromMatch } from "../lib/catalogueDraft";
import { pluralize } from "../lib/format";
import { productFormSchema, toProductPayload } from "../lib/validation";
import { CatalogueSourceNote } from "../products/CatalogueSourceNote";
import { ProductImage } from "../products/ProductImage";

interface QuickAddProps {
  code: string;
  format?: string;
  onSaved: (product: Product) => void;
}

/** Register an unknown barcode as a product with as little typing as possible. */
export function QuickAdd({ code, format, onSaved }: QuickAddProps) {
  const lookup = useCatalogueLookup(code, format);

  if (lookup.isPending) return <LoadingState label="Checking product catalogues…" />;
  // A failed lookup must never block registration: fall back to an empty draft.
  const data: CatalogueLookup = lookup.data ?? {
    code,
    kind: "other",
    existing: null,
    checkedCatalogues: false,
    matches: [],
    unavailable: [],
  };

  if (data.existing) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-warn">This barcode was added to your inventory in the meantime.</p>
        <Link to={`/products/${data.existing.id}/edit`} className="font-semibold text-accent hover:underline">
          {data.existing.name}
        </Link>
      </div>
    );
  }

  return <QuickAddForm key={data.code} lookup={data} failed={lookup.isError} code={data.code} onSaved={onSaved} />;
}

function QuickAddForm({ lookup, failed, code, onSaved }: { lookup: CatalogueLookup; failed: boolean; code: string; onSaved: (p: Product) => void }) {
  const match = lookup.matches[0] ?? null;
  const draft = draftFromMatch(code, match);
  const form = useForm(productFormSchema, draft.values);
  const save = useSaveProduct();
  const settings = useSettings();
  const navigate = useNavigate();

  const submit = form.handleSubmit((values, showServerErrors) => {
    if (save.isPending) return;
    save.mutate(
      { ...toProductPayload(values), imageUrl: draft.imageUrl, catalogue: draft.source },
      {
        onSuccess: onSaved,
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length > 0) showServerErrors(error.fields);
        },
      },
    );
  });

  const field = (name: keyof typeof form.values) => ({
    name,
    value: form.values[name],
    onValueChange: (value: string) => form.setValue(name, value),
    onBlur: () => form.touch(name),
    error: form.errors[name],
  });

  const status = match ? null : failed || lookup.unavailable.length > 0
    ? "The product catalogue could not be reached, so enter the details yourself. You can still save."
    : !lookup.checkedCatalogues
      ? "This is not a retail barcode, so no catalogue was checked. Enter the details yourself."
      : "No catalogue has details for this barcode. Enter them yourself.";

  const barcodeError = form.errors.barcode ?? form.errors["barcodes.0"];
  const otherFailure = save.error instanceof ApiError && Object.keys(save.error.fields).length > 0 ? null : save.error;
  const defaultThreshold = settings.data?.defaultLowStockThreshold;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Add as a new product</h2>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">{code}</p>
      </div>

      {match ? (
        <div className="flex items-start gap-3 rounded-md border border-line bg-canvas p-3">
          {match.imageUrl && <ProductImage url={match.imageUrl} alt={match.name ?? "Product photo"} />}
          <CatalogueSourceNote match={match} />
        </div>
      ) : (
        <p className="rounded-md bg-sunken px-3 py-2 text-sm text-ink-muted">{status}</p>
      )}

      <TextField label="Name" required autoComplete="off" {...field("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Brand" autoComplete="off" {...field("brand")} />
        <TextField label="SKU" required autoComplete="off" spellCheck={false} hint="Starts as the barcode; change it if you use your own codes." {...field("sku")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Quantity on hand" required inputMode="numeric" autoComplete="off" {...field("quantityOnHand")} />
        <TextField label="Cost price" inputMode="decimal" autoComplete="off" {...field("costPrice")} />
        <TextField label="Selling price" inputMode="decimal" autoComplete="off" {...field("sellingPrice")} />
      </div>

      <details className="rounded-md border border-line px-3 py-2 [&[open]]:pb-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-muted hover:text-ink">More details</summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Manufacturer" autoComplete="off" {...field("manufacturer")} />
            <TextField label="Category" autoComplete="off" {...field("category")} />
          </div>
          <TextField label="Description" multiline {...field("description")} />
        </div>
      </details>

      {defaultThreshold !== undefined && (
        <p className="text-sm text-ink-muted">Counts as low stock at {pluralize(defaultThreshold, "unit")} or fewer (your default).</p>
      )}
      {barcodeError && <Alert>{barcodeError}</Alert>}
      {otherFailure && <Alert>{errorMessage(otherFailure)}</Alert>}

      <Button type="submit" className="w-full" loading={save.isPending} loadingLabel="Saving…">
        Save product
      </Button>
      <button
        type="button"
        onClick={() => void navigate(`/products/new?barcode=${encodeURIComponent(code)}`, { state: { draft: { ...draft, values: form.values } } })}
        className="block w-full text-center text-sm font-medium text-accent hover:underline"
      >
        Open the full form instead
      </button>
    </form>
  );
}
