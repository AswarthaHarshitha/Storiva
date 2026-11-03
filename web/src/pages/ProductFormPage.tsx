import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ApiError, errorMessage } from "../api/client";
import type { Product } from "../api/types";
import { Alert } from "../components/Alert";
import { Button, ButtonLink } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useForm } from "../hooks/useForm";
import { useProduct, useSaveProduct, useSettings } from "../hooks/useInventory";
import { formatRelativeTime, pluralize } from "../lib/format";
import { productFormSchema, toProductPayload, type ProductFormValues } from "../lib/validation";
import { DeleteProductDialog } from "../products/DeleteProductDialog";
import { ProductBarcodes } from "../products/ProductBarcodes";
import { StockHistory } from "../products/StockHistory";

const emptyValues: ProductFormValues = {
  barcode: "",
  name: "",
  sku: "",
  description: "",
  quantityOnHand: "",
  lowStockThreshold: "",
  costPrice: "",
  sellingPrice: "",
};

const toFormValues = (product: Product): ProductFormValues => ({
  barcode: "",
  name: product.name,
  sku: product.sku,
  description: product.description ?? "",
  quantityOnHand: String(product.quantityOnHand),
  lowStockThreshold: product.lowStockThreshold === null ? "" : String(product.lowStockThreshold),
  costPrice: product.costPrice ?? "",
  sellingPrice: product.sellingPrice ?? "",
});

const backLink = (
  <Link to="/products" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
    <ArrowLeft className="size-4" aria-hidden />
    Products
  </Link>
);

export function NewProductPage() {
  useDocumentTitle("Add product");
  const [params] = useSearchParams();
  const scanned = params.get("barcode")?.slice(0, 200) ?? "";
  return (
    <>
      {backLink}
      <PageHeader
        title="Add product"
        description={
          scanned
            ? "The barcode you scanned is filled in. Add the details you know; you can change any of this later."
            : "Add an item you stock. You can change any of this later."
        }
      />
      <ProductForm initialValues={{ ...emptyValues, barcode: scanned }} />
    </>
  );
}

export function EditProductPage() {
  const { id } = useParams();
  const product = useProduct(id);
  useDocumentTitle(product.data ? `Edit ${product.data.name}` : "Edit product");

  if (product.isPending) {
    return (
      <>
        {backLink}
        <LoadingState label="Loading product…" />
      </>
    );
  }
  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404) {
      return (
        <>
          {backLink}
          <PageHeader title="Product not found" description="It may have been deleted, or the link is incorrect." />
          <ButtonLink to="/products" variant="secondary">
            Back to products
          </ButtonLink>
        </>
      );
    }
    return (
      <>
        {backLink}
        <QueryError error={product.error} onRetry={() => void product.refetch()} />
      </>
    );
  }

  return (
    <>
      {backLink}
      <PageHeader title={product.data.name} description={<LastUpdated product={product.data} />} />
      <ProductForm key={product.data.id} product={product.data} initialValues={toFormValues(product.data)} />
      <ProductBarcodes product={product.data} />
      <StockHistory productId={product.data.id} />
    </>
  );
}

function LastUpdated({ product }: { product: Product }) {
  return (
    <>
      Last updated {formatRelativeTime(product.updatedAt)}
      {product.lastUpdatedBy && <> by {product.lastUpdatedBy}</>}
      {product.lastAdjustmentNote && <> · Last stock note: “{product.lastAdjustmentNote}”</>}
    </>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b border-line py-6 first:pt-0 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ProductForm({ product, initialValues }: { product?: Product; initialValues: ProductFormValues }) {
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm(productFormSchema, initialValues);
  const save = useSaveProduct(product?.id);
  const settings = useSettings();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = form.handleSubmit((values, showServerErrors) => {
    if (save.isPending) return;
    save.mutate(toProductPayload(values), {
      onSuccess: (saved) => {
        toast(product ? `Saved changes to ${saved.name}.` : `${saved.name} was added.`);
        void navigate("/products");
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
          // The API reports barcode problems as "barcode" or "barcodes.0"; the form has one field.
          const { barcode, "barcodes.0": firstBarcode, ...rest } = error.fields;
          const barcodeError = barcode ?? firstBarcode;
          showServerErrors(barcodeError ? { ...rest, barcode: barcodeError } : rest);
        }
      },
    });
  });

  const field = (name: keyof ProductFormValues) => ({
    name,
    value: form.values[name],
    onValueChange: (value: string) => form.setValue(name, value),
    onBlur: () => form.touch(name),
    error: form.errors[name],
  });

  const defaultThreshold = settings.data?.defaultLowStockThreshold;
  const failure = save.error instanceof ApiError && Object.keys(save.error.fields).length > 0 ? null : save.error;

  return (
    <form onSubmit={submit} noValidate>
      <p className="mb-6 text-sm text-ink-muted">
        Fields marked <span className="text-accent">*</span> are required.
      </p>
      {failure && (
        <div className="mb-6">
          <Alert>{errorMessage(failure)}</Alert>
        </div>
      )}

      <Section title="Details" description="How the product is named and identified.">
        <TextField label="Name" required autoComplete="off" className="sm:col-span-2" {...field("name")} />
        <TextField label="SKU" required autoComplete="off" spellCheck={false} hint="Unique within your inventory." {...field("sku")} />
        {product ? (
          <div className="hidden sm:block" />
        ) : (
          <TextField
            label="Barcode"
            autoComplete="off"
            spellCheck={false}
            className="[&_input]:font-mono"
            hint="Optional. Scan or type the product's barcode."
            {...field("barcode")}
          />
        )}
        <TextField label="Description" multiline className="sm:col-span-2" {...field("description")} />
      </Section>

      <Section title="Stock" description="Units you have now, and when to treat the product as running low.">
        <TextField label="Quantity on hand" required inputMode="numeric" autoComplete="off" {...field("quantityOnHand")} />
        <TextField
          label="Low-stock threshold"
          inputMode="numeric"
          autoComplete="off"
          hint={
            defaultThreshold === undefined
              ? "Leave blank to use your default."
              : `Leave blank to use your default of ${pluralize(defaultThreshold, "unit")}.`
          }
          {...field("lowStockThreshold")}
        />
      </Section>

      <Section title="Pricing" description="Optional. Amounts are stored exactly, to two decimal places.">
        <TextField label="Cost price" inputMode="decimal" autoComplete="off" {...field("costPrice")} />
        <TextField label="Selling price" inputMode="decimal" autoComplete="off" {...field("sellingPrice")} />
      </Section>

      <div className="flex flex-col-reverse gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        {product ? (
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
            Delete product
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2 sm:justify-end">
          <ButtonLink to="/products" variant="secondary" className="flex-1 sm:flex-none">
            Cancel
          </ButtonLink>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending} loadingLabel="Saving…">
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      </div>

      {product && (
        <DeleteProductDialog
          product={confirmingDelete ? product : null}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => void navigate("/products", { replace: true })}
        />
      )}
    </form>
  );
}
