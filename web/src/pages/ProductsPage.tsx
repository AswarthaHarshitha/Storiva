import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Product } from "../api/types";
import { ButtonLink } from "../components/Button";
import { IconButton, IconLink } from "../components/IconButton";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { StockStatus } from "../components/StockStatus";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useDashboard, useProducts } from "../hooks/useInventory";
import { formatCount, formatPrice, pluralize } from "../lib/format";
import { AdjustStockDialog } from "../products/AdjustStockDialog";
import { DeleteProductDialog } from "../products/DeleteProductDialog";
import { applyView, readView, sortOptions, statusOptions, type StatusFilter } from "../products/productView";

export function ProductsPage() {
  useDocumentTitle("Products");
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 250);
  const [params, setParams] = useSearchParams();
  const { status, sort } = readView(params);
  const products = useProducts(query);
  const totals = useDashboard();
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const total = totals.data?.totalProducts;
  const hasNoProducts = total === 0 && !query;
  const filtering = Boolean(query) || status !== "all";

  const setParam = (key: "status" | "sort", value: string, fallback: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const clearFilters = () => {
    setSearch("");
    setParam("status", "all", "all");
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={total === undefined ? undefined : pluralize(total, "product")}
        actions={
          <ButtonLink to="/products/new">
            <Plus className="size-4" aria-hidden />
            Add product
          </ButtonLink>
        }
      />

      {!hasNoProducts && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:flex lg:items-end">
          <div className="col-span-2 lg:w-80">
            <label htmlFor="product-search" className="mb-1.5 block text-sm font-medium">
              Search by name or SKU
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                autoComplete="off"
                className="block w-full rounded-md border border-field bg-surface py-2 pr-9 pl-9 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
          <Select id="product-status" label="Show" value={status} options={statusOptions} onChange={(v) => setParam("status", v, "all")} />
          <Select id="product-sort" label="Sort by" value={sort} options={sortOptions} onChange={(v) => setParam("sort", v, "name")} />
        </div>
      )}

      {products.isPending ? (
        <LoadingState label="Loading products…" />
      ) : products.isError ? (
        <QueryError error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data.length === 0 && !filtering ? (
        <EmptyMessage>
          <span className="block font-medium text-ink">No products yet</span>
          Products you add appear here with their stock level and price.
          <span className="mt-4 block">
            <ButtonLink to="/products/new">
              <Plus className="size-4" aria-hidden />
              Add your first product
            </ButtonLink>
          </span>
        </EmptyMessage>
      ) : (
        <ProductResults
          products={applyView(products.data, status, sort)}
          total={total}
          query={query}
          status={status}
          stale={products.isPlaceholderData}
          onClear={clearFilters}
          onAdjust={setAdjusting}
          onDelete={setDeleting}
        />
      )}

      <AdjustStockDialog product={adjusting} onClose={() => setAdjusting(null)} />
      <DeleteProductDialog product={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function ProductResults({
  products,
  total,
  query,
  status,
  stale,
  onClear,
  ...actions
}: RowActions & {
  products: Product[];
  total: number | undefined;
  query: string;
  status: StatusFilter;
  stale: boolean;
  onClear: () => void;
}) {
  const filtering = Boolean(query) || status !== "all";

  if (products.length === 0) {
    const reason = query
      ? `No ${status === "all" ? "" : `${status === "low" ? "low-stock" : "out-of-stock"} `}products match “${query}”.`
      : status === "low"
        ? "No products are low on stock."
        : "No products are out of stock.";
    return (
      <EmptyMessage>
        {reason}{" "}
        <button type="button" onClick={onClear} className="font-medium text-accent hover:underline">
          {query ? "Clear search and filters" : "Show all products"}
        </button>
      </EmptyMessage>
    );
  }

  return (
    <div className={stale ? "opacity-60 transition-opacity" : undefined}>
      {filtering && total !== undefined && (
        <p className="mb-2 text-sm text-ink-muted" role="status">
          Showing {formatCount(products.length)} of {pluralize(total, "product")}
        </p>
      )}
      <ProductTable products={products} {...actions} />
      <ProductList products={products} {...actions} />
    </div>
  );
}

function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0 lg:w-48">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="block w-full rounded-md border border-field bg-surface px-3 py-2 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong px-5 py-12 text-center text-sm text-ink-muted">{children}</div>;
}

interface RowActions {
  onAdjust: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function Actions({ product, onAdjust, onDelete }: RowActions & { product: Product }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label={`Adjust stock for ${product.name}`} tooltip="Adjust stock" onClick={() => onAdjust(product)}>
        <ArrowUpDown className="size-4" aria-hidden />
      </IconButton>
      <IconLink to={`/products/${product.id}/edit`} label={`Edit ${product.name}`} tooltip="Edit product">
        <Pencil className="size-4" aria-hidden />
      </IconLink>
      <IconButton label={`Delete ${product.name}`} tooltip="Delete product" tone="danger" onClick={() => onDelete(product)}>
        <Trash2 className="size-4" aria-hidden />
      </IconButton>
    </div>
  );
}

function ProductTable({ products, ...actions }: RowActions & { products: Product[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Products</caption>
        <thead className="border-b border-line bg-sunken/60 text-left text-xs text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
            <th scope="col" className="px-4 py-2.5 font-medium">SKU</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Quantity</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Selling price</th>
            <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-canvas/70">
              <td className="max-w-xs px-4 py-2.5">
                <Link to={`/products/${product.id}/edit`} className="font-medium hover:text-accent hover:underline">
                  {product.name}
                </Link>
                {product.description && <p className="truncate text-xs text-ink-faint">{product.description}</p>}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{product.sku}</td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCount(product.quantityOnHand)}</td>
              <td className="px-4 py-2.5">
                <StockStatus quantity={product.quantityOnHand} threshold={product.effectiveThreshold} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatPrice(product.sellingPrice)}</td>
              <td className="px-2 py-1">
                <Actions product={product} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** On narrow screens each product becomes a compact block instead of a scrolling table row. */
function ProductList({ products, ...actions }: RowActions & { products: Product[] }) {
  return (
    <ul aria-label="Products" className="divide-y divide-line rounded-lg border border-line bg-surface md:hidden">
      {products.map((product) => (
        <li key={product.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/products/${product.id}/edit`} className="block truncate font-medium">
                {product.name}
              </Link>
              <p className="font-mono text-xs text-ink-muted">{product.sku}</p>
            </div>
            <StockStatus quantity={product.quantityOnHand} threshold={product.effectiveThreshold} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink tabular-nums">{formatCount(product.quantityOnHand)}</span> on hand
              {product.sellingPrice !== null && <> · {formatPrice(product.sellingPrice)}</>}
            </p>
            <Actions product={product} {...actions} />
          </div>
        </li>
      ))}
    </ul>
  );
}
