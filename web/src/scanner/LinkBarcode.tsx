import { useState } from "react";
import { Search } from "lucide-react";
import { errorMessage } from "../api/client";
import type { Product } from "../api/types";
import { Alert } from "../components/Alert";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAttachBarcode, useProducts } from "../hooks/useInventory";

/** Lets the user attach a scanned, unknown code to a product that is already in the inventory. */
export function LinkBarcode({ code, format, onLinked }: { code: string; format?: string; onLinked: (product: Product) => void }) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 250);
  const products = useProducts(query);
  const attach = useAttachBarcode();
  const matches = query ? (products.data ?? []).slice(0, 6) : [];

  return (
    <div className="space-y-3">
      <label htmlFor="link-search" className="block text-sm font-medium">
        Find the product this barcode belongs to
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          id="link-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or SKU"
          autoComplete="off"
          className="block w-full rounded-md border border-field bg-surface py-2 pr-3 pl-9 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
        />
      </div>
      {query && products.isSuccess && matches.length === 0 && <p className="text-sm text-ink-muted">No products match “{query}”.</p>}
      {matches.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {matches.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                disabled={attach.isPending}
                onClick={() =>
                  attach.mutate({ productId: product.id, code, format }, { onSuccess: (updated) => onLinked(updated) })
                }
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-sunken disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-ink-muted">{product.sku}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">Use this product</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {attach.isError && <Alert>{errorMessage(attach.error)}</Alert>}
    </div>
  );
}
