import { useId, useState } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useProducts } from "../hooks/useInventory";

interface Picked {
  id: string;
  name: string;
  sku: string;
}

/** A compact search-and-pick control for choosing one of the organization's products. */
export function ProductPicker({ label, value, onChange }: { label: string; value: Picked | null; onChange: (p: Picked | null) => void }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const query = useDebouncedValue(search.trim(), 200);
  const products = useProducts(query);
  const options = query ? (products.data ?? []).slice(0, 8) : [];

  if (value && !open) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium">{value.name}</span> <span className="font-mono text-xs text-ink-muted">{value.sku}</span>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-accent hover:underline">
          Change<span className="sr-only"> product for {label}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        placeholder="Search name or SKU"
        autoComplete="off"
        className="block w-full rounded-md border border-field bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
      />
      {options.length > 0 && (
        <ul aria-label={`Matching products for ${label}`} className="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-md border border-line bg-surface shadow-lg">
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: p.id, name: p.name, sku: p.sku });
                  setSearch("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-sunken"
              >
                <span className="block font-medium">{p.name}</span>
                <span className="font-mono text-xs text-ink-muted">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <button type="button" onClick={() => setOpen(false)} className="mt-1 text-xs text-ink-muted underline">
          Keep {value.name}
        </button>
      )}
    </div>
  );
}
